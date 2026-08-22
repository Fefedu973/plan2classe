import { gunzipSync } from "node:zlib";

import { z } from "zod";

import { classroomConfigSchema, preferenceResponseSchema } from "../packages/api/src/schemas/classroom";
import { solveClassroomById } from "../packages/api/src/services/solver";
import { auth } from "../packages/auth/src/index";
import { db, eq } from "../packages/db/src/index";
import { user } from "../packages/db/src/schema/auth";
import { classrooms, formResponses } from "../packages/db/src/schema/classroom";
import { env } from "../packages/env/src/server";

const seededResponseSchema = z.object({
  id: z.string().min(1),
  participantId: z.string().min(1),
  payload: preferenceResponseSchema,
  revision: z.number().int().positive(),
  firstSubmittedAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

const seededClassroomSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(160),
  slug: z.string().trim().min(1).max(72),
  description: z.string().max(2_000).default(""),
  published: z.boolean().default(false),
  config: classroomConfigSchema,
  responses: z.array(seededResponseSchema).default([]),
  solve: z.boolean().default(false),
}).superRefine((classroom, context) => {
  const participants = new Map(classroom.config.participants.map((item) => [item.id, item]));
  const enabledSeats = new Set(
    classroom.config.room.seats.filter((seat) => seat.enabled).map((seat) => seat.id),
  );
  const roomTags = [
    ...new Set(
      classroom.config.room.seats
        .filter((seat) => seat.enabled)
        .flatMap((seat) => seat.tags)
        .filter((tag) => tag !== "left" && tag !== "right" && !tag.startsWith("row:")),
    ),
  ];
  const namedZones = roomTags.filter((tag) => tag.startsWith("zone:") && tag.length > 5);
  const validZones = new Set(namedZones.length > 0 ? namedZones : roomTags);
  const responseIds = new Set<string>();
  const respondentIds = new Set<string>();

  for (const [index, response] of classroom.responses.entries()) {
    const issue = (message: string, path: Array<string | number> = []) =>
      context.addIssue({ code: "custom", message, path: ["responses", index, ...path] });
    if (responseIds.has(response.id)) issue("L'identifiant de réponse doit être unique.", ["id"]);
    responseIds.add(response.id);
    if (respondentIds.has(response.participantId)) {
      issue("Un participant ne peut avoir qu'une réponse seedée.", ["participantId"]);
    }
    respondentIds.add(response.participantId);

    const participant = participants.get(response.participantId);
    if (!participant?.active) issue("Le participant de la réponse est inconnu ou inactif.");
    if (response.payload.participant_id !== response.participantId) {
      issue("Le participant du payload ne correspond pas à l'enveloppe.", ["payload", "participant_id"]);
    }
    if (response.payload.revision !== response.revision) {
      issue("La révision du payload ne correspond pas à l'enveloppe.", ["payload", "revision"]);
    }
    const firstSubmittedAt = Date.parse(response.firstSubmittedAt);
    if (Date.parse(response.payload.submitted_at) !== firstSubmittedAt) {
      issue("submitted_at doit correspondre à firstSubmittedAt.", ["payload", "submitted_at"]);
    }
    if (Date.parse(response.updatedAt) < firstSubmittedAt) {
      issue("updatedAt ne peut pas précéder firstSubmittedAt.", ["updatedAt"]);
    }
    if (response.payload.seat_ranking.length > classroom.config.form.maxSeatChoices) {
      issue("Trop de choix de places pour la configuration du formulaire.", ["payload", "seat_ranking"]);
    }
    if (response.payload.desired_neighbors.length > classroom.config.form.maxNeighborChoices) {
      issue("Trop de voisins souhaités pour la configuration du formulaire.", ["payload", "desired_neighbors"]);
    }
    if (response.payload.avoided_neighbors.length > classroom.config.form.maxAvoidChoices) {
      issue("Trop de voisins évités pour la configuration du formulaire.", ["payload", "avoided_neighbors"]);
    }
    if (response.payload.seat_ranking.some((seatId) => !enabledSeats.has(seatId))) {
      issue("Une place classée est inconnue ou désactivée.", ["payload", "seat_ranking"]);
    }
    if (response.payload.zone_ranking.some((zone) => !validZones.has(zone))) {
      issue("Une zone classée n'est pas exposée par le formulaire.", ["payload", "zone_ranking"]);
    }

    const neighborKeys = new Set<string>();
    for (const [kind, neighbors] of [
      ["desired_neighbors", response.payload.desired_neighbors],
      ["avoided_neighbors", response.payload.avoided_neighbors],
    ] as const) {
      for (const neighbor of neighbors) {
        if (!participants.get(neighbor.participant_id)?.active) {
          issue("Un voisin référencé est inconnu ou inactif.", ["payload", kind]);
        }
        if (neighbor.participant_id === response.participantId) {
          issue("Un participant ne peut pas se choisir comme voisin.", ["payload", kind]);
        }
        const key = `${neighbor.participant_id}\u0000${neighbor.relation}`;
        if (neighborKeys.has(key)) {
          issue("Un voisin ne peut pas être à la fois souhaité et évité.", ["payload", kind]);
        }
        neighborKeys.add(key);
      }
    }
  }
});

const seedPayloadSchema = z.object({
  classes: z.array(seededClassroomSchema).min(1).max(10),
});

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`La variable ${name} est requise.`);
  return value;
}

function readSeedPayload() {
  const compressed = process.env.DEMO_SEED_GZIP_B64?.trim();
  const json = compressed
    ? gunzipSync(Buffer.from(compressed, "base64")).toString("utf8")
    : Buffer.from(requiredEnvironment("DEMO_SEED_B64"), "base64").toString("utf8");
  return seedPayloadSchema.parse(JSON.parse(json));
}

async function deleteDemoAccount(username: string) {
  const existing = await db.query.user.findFirst({ where: eq(user.username, username) });
  if (!existing) {
    console.log(JSON.stringify({ action: "delete", username, deleted: false }));
    return;
  }
  const confirmation = requiredEnvironment("DEMO_CONFIRM_DELETE");
  if (confirmation !== `${existing.id}:${username}`) {
    throw new Error(
      "Suppression refusée : DEMO_CONFIRM_DELETE doit valoir <userId>:<username> tel qu'affiché lors du seed.",
    );
  }
  const deleted = await db.delete(user).where(eq(user.id, existing.id)).returning({ id: user.id });
  console.log(
    JSON.stringify({ action: "delete", username, deleted: deleted.length === 1, userId: existing.id }),
  );
}

async function seedDemoAccount(username: string) {
  const password = requiredEnvironment("DEMO_PASSWORD");
  const displayName = process.env.DEMO_DISPLAY_NAME?.trim() || "Compte de démonstration";
  const payload = readSeedPayload();

  const existing = await db.query.user.findFirst({ where: eq(user.username, username) });
  if (existing) throw new Error(`Le compte ${username} existe déjà.`);

  const created = await auth.api.signUpEmail({
    body: {
      email: "local-account@plan2classe.invalid",
      name: displayName,
      password,
      username,
    },
    headers: new Headers({ Origin: env.CORS_ORIGIN, "x-real-ip": "127.0.0.1" }),
  });
  const ownerId = created.user.id;

  try {
    await db.transaction(async (transaction) => {
      const now = new Date();
      for (const classroom of payload.classes) {
        await transaction.insert(classrooms).values({
          id: classroom.id,
          ownerId,
          name: classroom.name,
          slug: classroom.slug,
          description: classroom.description,
          published: classroom.published,
          config: classroom.config,
          createdAt: now,
          updatedAt: now,
        });
        if (classroom.responses.length > 0) {
          await transaction.insert(formResponses).values(
            classroom.responses.map((response) => ({
              id: response.id,
              classroomId: classroom.id,
              participantId: response.participantId,
              payload: response.payload,
              revision: response.revision,
              firstSubmittedAt: new Date(response.firstSubmittedAt),
              updatedAt: new Date(response.updatedAt),
            })),
          );
        }
      }
    });

    const solved: Array<{ classroomId: string; status: string }> = [];
    for (const classroom of payload.classes.filter((item) => item.solve)) {
      const solution = await solveClassroomById(db, classroom.id);
      if (solution.result.status !== "optimal" && solution.result.status !== "feasible") {
        throw new Error(
          `Le calcul de ${classroom.id} n'a produit aucun plan valide (${solution.result.status}).`,
        );
      }
      solved.push({ classroomId: classroom.id, status: solution.result.status });
    }
    console.log(
      JSON.stringify({
        action: "seed",
        username,
        userId: ownerId,
        classes: payload.classes.map((item) => ({
          id: item.id,
          slug: item.slug,
          responses: item.responses.length,
        })),
        solved,
      }),
    );
  } catch (error) {
    await db.delete(user).where(eq(user.id, ownerId));
    throw error;
  }
}

const username = requiredEnvironment("DEMO_USERNAME").toLowerCase();
if (process.env.DEMO_ACTION === "delete") {
  await deleteDemoAccount(username);
} else {
  await seedDemoAccount(username);
}
