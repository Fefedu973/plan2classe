import { createHash, timingSafeEqual } from "node:crypto";

import { ORPCError } from "@orpc/server";
import { and, desc, eq, type Database } from "@plan2classe-app/db";
import { classrooms, formResponses, solutions } from "@plan2classe-app/db/schema/classroom";

import { newId } from "../domain/defaults";
import {
  preferenceResponseSchema,
  publicClassroomPayloadSchema,
  publicResponseInputSchema,
  type PreferenceResponse,
} from "../schemas/classroom";
import { getOwnedClassroomRow } from "./classrooms";
import { parseClassroomConfig, parseResponseRow } from "./serialization";
import { solveClassroomById } from "./solver";

const submissionQueues = new Map<string, Promise<unknown>>();

function serializeSubmission<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = submissionQueues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  submissionQueues.set(key, next);
  const cleanup = () => {
    if (submissionQueues.get(key) === next) submissionQueues.delete(key);
  };
  void next.then(cleanup, cleanup);
  return next;
}

function secureCodeMatches(actual: string | undefined, expected: string): boolean {
  const digest = (value: string) =>
    createHash("sha256").update(value.trim().toUpperCase(), "utf8").digest();
  return timingSafeEqual(digest(actual ?? ""), digest(expected));
}

function unique(values: string[]): boolean {
  return new Set(values).size === values.length;
}

function publicZoneTags(config: ReturnType<typeof parseClassroomConfig>): string[] {
  const tags = [
    ...new Set(
      config.room.seats
        .filter((seat) => seat.enabled)
        .flatMap((seat) => seat.tags)
        .filter((tag) => tag !== "left" && tag !== "right" && !tag.startsWith("row:")),
    ),
  ];
  const namedZones = tags.filter((tag) => tag.startsWith("zone:") && tag.length > 5);
  return (namedZones.length > 0 ? namedZones : tags).sort((left, right) =>
    left.localeCompare(right, "fr"),
  );
}

function validatePublicResponse(
  raw: unknown,
  config: ReturnType<typeof parseClassroomConfig>,
): PreferenceResponse {
  const response = publicResponseInputSchema.parse(raw);
  const activePeople = new Set(
    config.participants.filter((participant) => participant.active).map((participant) => participant.id),
  );
  const activeSeats = new Set(
    config.room.seats.filter((seat) => seat.enabled).map((seat) => seat.id),
  );
  const zones = new Set(publicZoneTags(config));
  const fail = (message: string): never => {
    throw new ORPCError("BAD_REQUEST", { message });
  };

  if (!activePeople.has(response.participant_id)) fail("Ce participant n’est pas disponible.");
  if (response.seat_ranking.length > config.form.maxSeatChoices) {
    fail("Trop de choix de places ont été envoyés.");
  }
  if (response.desired_neighbors.length > config.form.maxNeighborChoices) {
    fail("Trop de souhaits de voisinage ont été envoyés.");
  }
  if (response.avoided_neighbors.length > config.form.maxAvoidChoices) {
    fail("Trop d’évitements ont été envoyés.");
  }
  if (!unique(response.seat_ranking) || !unique(response.zone_ranking)) {
    fail("Un classement ne peut pas contenir de doublon.");
  }
  if (response.seat_ranking.some((seatId) => !activeSeats.has(seatId))) {
    fail("Une place sélectionnée n’existe plus.");
  }
  if (!config.form.collectZones && response.zone_ranking.length > 0) {
    fail("La sélection de zones est désactivée.");
  }
  if (response.zone_ranking.some((zone) => !zones.has(zone))) {
    fail("Une zone sélectionnée n’existe plus.");
  }
  if (!config.form.collectPriority && response.priority_mode !== "none") {
    fail("La priorité de réponse est désactivée.");
  }
  if (!config.form.collectNotes && response.notes.trim()) {
    fail("Les notes sont désactivées.");
  }

  const neighborKeys = new Set<string>();
  for (const item of [...response.desired_neighbors, ...response.avoided_neighbors]) {
    if (!activePeople.has(item.participant_id) || item.participant_id === response.participant_id) {
      fail("Un voisin sélectionné est invalide.");
    }
    const key = `${item.participant_id}\u0000${item.relation}`;
    if (neighborKeys.has(key)) fail("Un même voisin ne peut pas être souhaité et évité.");
    neighborKeys.add(key);
  }

  return preferenceResponseSchema.parse({
    ...response,
    submitted_at: new Date().toISOString(),
    revision: 1,
  });
}

export async function getPublicClassroom(database: Database, slug: string) {
  const row = await database.query.classrooms.findFirst({
    where: and(eq(classrooms.slug, slug), eq(classrooms.published, true)),
  });
  if (!row) throw new ORPCError("NOT_FOUND", { message: "Formulaire introuvable." });
  const config = parseClassroomConfig(row.config);
  const zones = publicZoneTags(config);

  return publicClassroomPayloadSchema.parse({
    classroom: {
      id: row.id,
      name: row.name,
      description: row.description,
      slug: row.slug,
      form: config.form,
      room: config.room,
    },
    participants: config.participants
      .filter((participant) => participant.active)
      .map(({ id, name }) => ({ id, name })),
    zones,
  });
}

export async function submitPublicResponse(
  database: Database,
  input: { slug: string; accessCode?: string; response: unknown },
) {
  const initialClassroom = await database.query.classrooms.findFirst({
    where: and(eq(classrooms.slug, input.slug), eq(classrooms.published, true)),
  });
  if (!initialClassroom) {
    throw new ORPCError("NOT_FOUND", { message: "Formulaire introuvable." });
  }
  const saved = await serializeSubmission(initialClassroom.id, () =>
    database.transaction(async (transaction) => {
      const classroom = await transaction.query.classrooms.findFirst({
        where: and(eq(classrooms.id, initialClassroom.id), eq(classrooms.published, true)),
      });
      if (!classroom) {
        throw new ORPCError("NOT_FOUND", { message: "Formulaire introuvable." });
      }
      const config = parseClassroomConfig(classroom.config);
      const response = validatePublicResponse(input.response, config);
      const participant = config.participants.find(
        (item) => item.id === response.participant_id && item.active,
      );
      if (!participant) {
        throw new ORPCError("BAD_REQUEST", { message: "Participant invalide." });
      }
      if (
        config.form.accessMode === "code" &&
        !secureCodeMatches(input.accessCode, participant.accessCode)
      ) {
        throw new ORPCError("UNAUTHORIZED", { message: "Code participant incorrect." });
      }
      const existing = await transaction.query.formResponses.findFirst({
        where: and(
          eq(formResponses.classroomId, classroom.id),
          eq(formResponses.participantId, participant.id),
        ),
      });
      if (existing && !config.form.allowEdits) {
        throw new ORPCError("CONFLICT", { message: "Cette réponse ne peut plus être modifiée." });
      }
      const now = new Date();
      const firstSubmittedAt = existing?.firstSubmittedAt ?? now;
      const revision = (existing?.revision ?? 0) + 1;
      const payload = preferenceResponseSchema.parse({
        ...response,
        submitted_at: firstSubmittedAt.toISOString(),
        revision,
      });

      if (existing) {
        await transaction
          .update(formResponses)
          .set({ payload, revision, updatedAt: now })
          .where(eq(formResponses.id, existing.id));
      } else {
        await transaction.insert(formResponses).values({
          id: newId("response"),
          classroomId: classroom.id,
          participantId: participant.id,
          payload,
          revision,
          firstSubmittedAt,
          updatedAt: now,
        });
      }
      const touched = await transaction
        .update(classrooms)
        .set({ version: classroom.version + 1, updatedAt: now })
        .where(
          and(
            eq(classrooms.id, classroom.id),
            eq(classrooms.version, classroom.version),
          ),
        )
        .returning({ id: classrooms.id });
      if (!touched[0]) {
        throw new ORPCError("CONFLICT", {
          message: "La classe a changé pendant la soumission. Réessayez.",
        });
      }
      return {
        revision,
        autoSolve: config.settings.auto_solve_on_response,
        confirmationMessage: config.form.confirmationMessage,
      };
    }),
  );

  let solve = null;
  if (saved.autoSolve) {
    try {
      solve = await solveClassroomById(database, initialClassroom.id);
    } catch {
      // The response is durable even if the optional background-like recalculation fails.
    }
  }

  return {
    saved: true as const,
    revision: saved.revision,
    confirmationMessage: saved.confirmationMessage,
    solve,
  };
}

export async function listOwnedResponses(
  database: Database,
  ownerId: string,
  classroomId: string,
) {
  const classroom = await getOwnedClassroomRow(database, ownerId, classroomId);
  const config = parseClassroomConfig(classroom.config);
  const names = new Map(config.participants.map((participant) => [participant.id, participant.name]));
  const rows = await database
    .select()
    .from(formResponses)
    .where(eq(formResponses.classroomId, classroomId))
    .orderBy(desc(formResponses.updatedAt));
  return {
    items: rows.map((row) => ({
      ...parseResponseRow(row),
      participantName: names.get(row.participantId) ?? "Participant supprimé",
    })),
  };
}

export async function resetOwnedResponses(
  database: Database,
  ownerId: string,
  classroomId: string,
) {
  return database.transaction(async (transaction) => {
    const row = await transaction.query.classrooms.findFirst({
      where: and(eq(classrooms.id, classroomId), eq(classrooms.ownerId, ownerId)),
    });
    if (!row) throw new ORPCError("NOT_FOUND", { message: "Classe introuvable." });
    const config = parseClassroomConfig(row.config);
    const deleted = await transaction
      .delete(formResponses)
      .where(eq(formResponses.classroomId, classroomId))
      .returning({ id: formResponses.id });
    await transaction.delete(solutions).where(eq(solutions.classroomId, classroomId));
    const touched = await transaction
      .update(classrooms)
      .set({
        config: { ...config, previous_assignment: {} },
        version: row.version + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(classrooms.id, classroomId),
          eq(classrooms.ownerId, ownerId),
          eq(classrooms.version, row.version),
        ),
      )
      .returning({ id: classrooms.id });
    if (!touched[0]) {
      throw new ORPCError("CONFLICT", {
        message: "La classe a changé pendant la réinitialisation. Réessayez.",
      });
    }
    return { reset: true as const, deletedCount: deleted.length };
  });
}
