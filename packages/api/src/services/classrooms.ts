import { ORPCError } from "@orpc/server";
import { and, count, desc, eq, inArray, ne, type Database } from "@plan2classe-app/db";
import { classrooms, formResponses, solutions } from "@plan2classe-app/db/schema/classroom";

import { createAccessCode, createDefaultClassroomConfig, newId } from "../domain/defaults";
import {
  classroomConfigSchema,
  preferenceResponseSchema,
  type ClassroomConfig,
} from "../schemas/classroom";
import {
  normalizeSlug,
  parseClassroomConfig,
  parseResponseRow,
  parseSolutionRow,
  serializeClassroom,
  structuralConfigFingerprint,
} from "./serialization";

export async function getOwnedClassroomRow(
  database: Database,
  ownerId: string,
  classroomId: string,
) {
  const row = await database.query.classrooms.findFirst({
    where: and(eq(classrooms.id, classroomId), eq(classrooms.ownerId, ownerId)),
  });
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "Classe introuvable." });
  }
  return row;
}

async function assertSlugAvailable(
  database: Database,
  slug: string,
  exceptClassroomId?: string,
): Promise<void> {
  const condition = exceptClassroomId
    ? and(eq(classrooms.slug, slug), ne(classrooms.id, exceptClassroomId))
    : eq(classrooms.slug, slug);
  const existing = await database.query.classrooms.findFirst({ where: condition });
  if (existing) {
    throw new ORPCError("CONFLICT", { message: "Ce lien public est déjà utilisé." });
  }
}

async function generateSlug(database: Database, name: string): Promise<string> {
  const base = normalizeSlug(name) || "classe";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 6);
    const candidate = `${base.slice(0, 65)}-${suffix}`;
    const existing = await database.query.classrooms.findFirst({
      columns: { id: true },
      where: eq(classrooms.slug, candidate),
    });
    if (!existing) return candidate;
  }
  throw new ORPCError("INTERNAL_SERVER_ERROR", {
    message: "Impossible de générer un lien public unique.",
  });
}

export async function listOwnedClassrooms(database: Database, ownerId: string) {
  const rows = await database
    .select()
    .from(classrooms)
    .where(eq(classrooms.ownerId, ownerId))
    .orderBy(desc(classrooms.updatedAt));
  if (rows.length === 0) return { items: [] };

  const ids = rows.map((row) => row.id);
  const [responseCounts, solutionCounts] = await Promise.all([
    database
      .select({ classroomId: formResponses.classroomId, value: count() })
      .from(formResponses)
      .where(inArray(formResponses.classroomId, ids))
      .groupBy(formResponses.classroomId),
    database
      .select({ classroomId: solutions.classroomId, value: count() })
      .from(solutions)
      .where(inArray(solutions.classroomId, ids))
      .groupBy(solutions.classroomId),
  ]);
  const responsesByClassroom = new Map(
    responseCounts.map((item) => [item.classroomId, item.value]),
  );
  const solutionsByClassroom = new Map(
    solutionCounts.map((item) => [item.classroomId, item.value]),
  );

  return {
    items: rows.map((row) => {
      const config = parseClassroomConfig(row.config);
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        published: row.published,
        participantCount: config.participants.filter((participant) => participant.active).length,
        responseCount: responsesByClassroom.get(row.id) ?? 0,
        seatCount: config.room.seats.filter((seat) => seat.enabled).length,
        hasSolution: (solutionsByClassroom.get(row.id) ?? 0) > 0,
        updatedAt: row.updatedAt.toISOString(),
      };
    }),
  };
}

export async function getOwnedClassroomBundle(
  database: Database,
  ownerId: string,
  classroomId: string,
) {
  const row = await getOwnedClassroomRow(database, ownerId, classroomId);
  const [responseCountRows, latestSolutionRow] = await Promise.all([
    database
      .select({ value: count() })
      .from(formResponses)
      .where(eq(formResponses.classroomId, row.id)),
    database.query.solutions.findFirst({
      orderBy: desc(solutions.createdAt),
      where: eq(solutions.classroomId, row.id),
    }),
  ]);
  return {
    classroom: serializeClassroom(row),
    responseCount: responseCountRows[0]?.value ?? 0,
    latestSolution: latestSolutionRow ? parseSolutionRow(latestSolutionRow) : null,
  };
}

export async function createClassroom(
  database: Database,
  ownerId: string,
  input: { name: string; description?: string; template: "blank" | "demo" },
) {
  const now = new Date();
  const name = input.name.trim();
  const config = classroomConfigSchema.parse(createDefaultClassroomConfig(input.template));
  const row = (
    await database
      .insert(classrooms)
      .values({
        id: newId("classroom"),
        ownerId,
        name,
        slug: await generateSlug(database, name),
        description: input.description?.trim() ?? "",
        published: false,
        config,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
  )[0];
  if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
  return { classroom: serializeClassroom(row) };
}

function sanitizePreviousAssignment(config: ClassroomConfig): ClassroomConfig {
  const people = new Set(config.participants.map((participant) => participant.id));
  const seats = new Set(config.room.seats.filter((seat) => seat.enabled).map((seat) => seat.id));
  return {
    ...config,
    previous_assignment: Object.fromEntries(
      Object.entries(config.previous_assignment).filter(
        ([participantId, seatId]) => people.has(participantId) && seats.has(seatId),
      ),
    ),
  };
}

type FormResponseRow = typeof formResponses.$inferSelect;

function cleanResponsePayload(current: ReturnType<typeof parseResponseRow>["response"], config: ClassroomConfig) {
  const participantIds = new Set(config.participants.map((participant) => participant.id));
  const seatIds = new Set(config.room.seats.filter((seat) => seat.enabled).map((seat) => seat.id));
  const zones = new Set(
    config.room.seats
      .filter((seat) => seat.enabled)
      .flatMap((seat) => seat.tags)
      .filter((tag) => tag !== "left" && tag !== "right" && !tag.startsWith("row:")),
  );

  return preferenceResponseSchema.parse({
    ...current,
    seat_ranking: current.seat_ranking.filter((seatId) => seatIds.has(seatId)),
    zone_ranking: current.zone_ranking.filter((zone) => zones.has(zone)),
    desired_neighbors: current.desired_neighbors.filter((item) =>
      participantIds.has(item.participant_id),
    ),
    avoided_neighbors: current.avoided_neighbors.filter((item) =>
      participantIds.has(item.participant_id),
    ),
  });
}

async function readResponseById(database: Database, classroomId: string, responseId: string) {
  return database.query.formResponses.findFirst({
    where: and(eq(formResponses.id, responseId), eq(formResponses.classroomId, classroomId)),
  });
}

export async function cleanResponseForConfig(
  database: Database,
  config: ClassroomConfig,
  classroomId: string,
  initialRow: FormResponseRow,
) {
  const participantIds = new Set(config.participants.map((participant) => participant.id));
  let row: FormResponseRow | undefined = initialRow;

  // A public submission can revise the same row while a classroom edit is
  // cleaning obsolete references. Every write is therefore a compare-and-swap;
  // after a miss we re-read and clean the newest revision instead of overwriting it.
  for (let attempt = 0; attempt < 32 && row; attempt += 1) {
    const unchangedSinceRead = and(
      eq(formResponses.id, row.id),
      eq(formResponses.classroomId, classroomId),
      eq(formResponses.revision, row.revision),
      eq(formResponses.updatedAt, row.updatedAt),
    );

    if (!participantIds.has(row.participantId)) {
      const deleted = await database
        .delete(formResponses)
        .where(unchangedSinceRead)
        .returning({ id: formResponses.id });
      if (deleted[0]) return;
      row = await readResponseById(database, classroomId, row.id);
      continue;
    }

    const current = parseResponseRow(row).response;
    const next = cleanResponsePayload(current, config);
    if (JSON.stringify(current) === JSON.stringify(next)) return;

    const updated = await database
      .update(formResponses)
      .set({ payload: next, updatedAt: new Date() })
      .where(unchangedSinceRead)
      .returning({ id: formResponses.id });
    if (updated[0]) return;
    row = await readResponseById(database, classroomId, row.id);
  }

  if (row) {
    throw new ORPCError("CONFLICT", {
      message: "Une réponse change trop rapidement pour être nettoyée. Réessayez.",
    });
  }
}

async function cleanResponsesForConfig(database: Database, config: ClassroomConfig, classroomId: string) {
  const rows = await database
    .select()
    .from(formResponses)
    .where(eq(formResponses.classroomId, classroomId));

  for (const row of rows) {
    await cleanResponseForConfig(database, config, classroomId, row);
  }
}

export async function updateClassroom(
  database: Database,
  ownerId: string,
  input: {
    id: string;
    name?: string;
    slug?: string;
    description?: string;
    published?: boolean;
    config?: ClassroomConfig;
  },
) {
  const current = await getOwnedClassroomRow(database, ownerId, input.id);
  const currentConfig = parseClassroomConfig(current.config);
  let nextConfig = input.config
    ? classroomConfigSchema.parse(
        sanitizePreviousAssignment({
          ...input.config,
          // Solver state is server-managed. A stale editor must never overwrite
          // an assignment computed after the page was loaded.
          previous_assignment: currentConfig.previous_assignment,
        }),
      )
    : currentConfig;
  const structureChanged =
    structuralConfigFingerprint(currentConfig) !== structuralConfigFingerprint(nextConfig);
  if (structureChanged) nextConfig = { ...nextConfig, previous_assignment: {} };

  const slug = input.slug === undefined ? current.slug : normalizeSlug(input.slug);
  if (!slug) throw new ORPCError("BAD_REQUEST", { message: "Le lien public est invalide." });
  if (slug !== current.slug) await assertSlugAvailable(database, slug, current.id);

  const row = (
    await database
      .update(classrooms)
      .set({
        name: input.name?.trim() ?? current.name,
        slug,
        description: input.description?.trim() ?? current.description,
        published: input.published ?? current.published,
        config: nextConfig,
        version: current.version + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(classrooms.id, current.id),
          eq(classrooms.ownerId, ownerId),
          eq(classrooms.version, current.version),
        ),
      )
      .returning()
  )[0];
  if (!row) {
    throw new ORPCError("CONFLICT", {
      message: "La classe a été modifiée ailleurs. Rechargez-la avant d’enregistrer.",
    });
  }

  if (input.config) await cleanResponsesForConfig(database, nextConfig, current.id);
  if (structureChanged) {
    await database.delete(solutions).where(eq(solutions.classroomId, current.id));
  }
  return { classroom: serializeClassroom(row) };
}

export async function deleteClassroom(
  database: Database,
  ownerId: string,
  classroomId: string,
) {
  await getOwnedClassroomRow(database, ownerId, classroomId);
  const deleted = await database
    .delete(classrooms)
    .where(and(eq(classrooms.id, classroomId), eq(classrooms.ownerId, ownerId)))
    .returning({ id: classrooms.id });
  if (!deleted[0]) throw new ORPCError("NOT_FOUND", { message: "Classe introuvable." });
  return { deleted: true as const, id: classroomId };
}

export async function duplicateClassroom(
  database: Database,
  ownerId: string,
  input: { id: string; name?: string },
) {
  const source = await getOwnedClassroomRow(database, ownerId, input.id);
  const sourceConfig = parseClassroomConfig(source.config);
  const config = classroomConfigSchema.parse({
    ...sourceConfig,
    participants: sourceConfig.participants.map((participant) => ({
      ...participant,
      accessCode: createAccessCode(),
    })),
    previous_assignment: {},
  });
  const name = input.name?.trim() || `${source.name} — copie`;
  const now = new Date();
  const row = (
    await database
      .insert(classrooms)
      .values({
        id: newId("classroom"),
        ownerId,
        name,
        slug: await generateSlug(database, name),
        description: source.description,
        published: false,
        config,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
  )[0];
  if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
  return { classroom: serializeClassroom(row) };
}
