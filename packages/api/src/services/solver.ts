import { ORPCError } from "@orpc/server";
import { and, desc, eq, inArray, type Database } from "@plan2classe-app/db";
import { classrooms, formResponses, solutions } from "@plan2classe-app/db/schema/classroom";
import { env } from "@plan2classe-app/env/server";

import { newId } from "../domain/defaults";
import { projectSnapshotSchema, solveResultSchema } from "../schemas/classroom";
import type { ClassroomConfig, SolveResult } from "../schemas/classroom";
import { getOwnedClassroomRow } from "./classrooms";
import {
  parseClassroomConfig,
  parseResponseRow,
  parseSolutionRow,
  structuralConfigFingerprint,
} from "./serialization";

const solveQueues = new Map<string, Promise<unknown>>();

function serializeSolve<T>(classroomId: string, work: () => Promise<T>): Promise<T> {
  const previous = solveQueues.get(classroomId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  solveQueues.set(classroomId, next);
  const cleanup = () => {
    if (solveQueues.get(classroomId) === next) solveQueues.delete(classroomId);
  };
  void next.then(cleanup, cleanup);
  return next;
}

async function requestSolver(snapshot: unknown) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.SOLVER_TIMEOUT_MS);
  try {
    const response = await fetch(`${env.SOLVER_URL.replace(/\/$/, "")}/solve`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(snapshot),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ORPCError("BAD_GATEWAY", {
        message: `Le moteur de placement a répondu avec le statut ${response.status}.`,
      });
    }
    const parsed = solveResultSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new ORPCError("BAD_GATEWAY", {
        message: "Le moteur de placement a renvoyé un résultat invalide.",
        cause: parsed.error,
      });
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof ORPCError) throw error;
    if (controller.signal.aborted) {
      throw new ORPCError("GATEWAY_TIMEOUT", {
        message: "Le calcul du plan de classe a dépassé le délai autorisé.",
        cause: error,
      });
    }
    throw new ORPCError("SERVICE_UNAVAILABLE", {
      message: "Le moteur de placement est momentanément indisponible.",
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function validateResultReferences(result: SolveResult, config: ClassroomConfig): void {
  const participants = new Set(
    config.participants.filter((participant) => participant.active).map((participant) => participant.id),
  );
  const seats = new Set(
    config.room.seats.filter((seat) => seat.enabled).map((seat) => seat.id),
  );
  const invalid = (message: string): never => {
    throw new ORPCError("BAD_GATEWAY", { message });
  };
  for (const person of result.people) {
    if (!participants.has(person.participant_id) || !seats.has(person.seat_id)) {
      invalid("Le moteur a référencé un participant ou une place inconnue.");
    }
  }
  if (result.status !== "optimal" && result.status !== "feasible") return;
  const assignedPeople = Object.keys(result.assignment);
  const assignedSeats = Object.values(result.assignment);
  if (
    assignedPeople.length !== participants.size ||
    assignedPeople.some((participantId) => !participants.has(participantId)) ||
    assignedSeats.some((seatId) => !seats.has(seatId)) ||
    new Set(assignedSeats).size !== assignedSeats.length
  ) {
    invalid("Le moteur a renvoyé une affectation incomplète ou incohérente.");
  }
  if (
    result.people.length !== participants.size ||
    result.people.some(
      (person) => result.assignment[person.participant_id] !== person.seat_id,
    )
  ) {
    invalid("Le détail du résultat ne correspond pas à l’affectation.");
  }
  if (!result.hard_constraints_verified) {
    invalid("Le moteur n’a pas confirmé les contraintes obligatoires.");
  }
}

function responseFingerprint(rows: (typeof formResponses.$inferSelect)[]): string {
  return rows
    .map((row) => `${row.id}:${row.revision}:${row.updatedAt.getTime()}`)
    .sort()
    .join("|");
}

async function solveCurrentClassroom(database: Database, classroomId: string) {
  const classroom = await database.query.classrooms.findFirst({
    where: eq(classrooms.id, classroomId),
  });
  if (!classroom) throw new ORPCError("NOT_FOUND", { message: "Classe introuvable." });
  const config = parseClassroomConfig(classroom.config);
  const responseRows = await database
    .select()
    .from(formResponses)
    .where(eq(formResponses.classroomId, classroomId));
  const inputFingerprint = `${structuralConfigFingerprint(config)}\n${responseFingerprint(responseRows)}`;
  const participants = config.participants.map(({ accessCode: _accessCode, ...participant }) =>
    participant,
  );
  const snapshot = projectSnapshotSchema.parse({
    id: classroom.id,
    name: classroom.name,
    slug: classroom.slug,
    admin_token: "internal",
    created_at: classroom.createdAt.toISOString(),
    updated_at: classroom.updatedAt.toISOString(),
    room: config.room,
    participants,
    responses: responseRows.map((row) => parseResponseRow(row).response),
    rules: config.rules,
    settings: config.settings,
    previous_assignment: config.previous_assignment,
    published: classroom.published,
  });
  const result = await requestSolver(snapshot);
  validateResultReferences(result, config);

  const row = await database.transaction(async (transaction) => {
    const latestClassroom = await transaction.query.classrooms.findFirst({
      where: eq(classrooms.id, classroomId),
    });
    if (!latestClassroom) {
      throw new ORPCError("NOT_FOUND", { message: "Classe introuvable." });
    }
    const latestConfig = parseClassroomConfig(latestClassroom.config);
    const latestResponses = await transaction
      .select()
      .from(formResponses)
      .where(eq(formResponses.classroomId, classroomId));
    const latestFingerprint = `${structuralConfigFingerprint(latestConfig)}\n${responseFingerprint(latestResponses)}`;
    if (latestClassroom.version !== classroom.version || latestFingerprint !== inputFingerprint) {
      throw new ORPCError("CONFLICT", {
        message: "La classe a changé pendant le calcul. Relancez le solveur.",
      });
    }

    const now = new Date();
    const updated = await transaction
      .update(classrooms)
      .set({
        config:
          result.status === "optimal" || result.status === "feasible"
            ? { ...latestConfig, previous_assignment: result.assignment }
            : latestConfig,
        version: latestClassroom.version + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(classrooms.id, classroomId),
          eq(classrooms.version, latestClassroom.version),
        ),
      )
      .returning({ id: classrooms.id });
    if (!updated[0]) {
      throw new ORPCError("CONFLICT", {
        message: "La classe a changé pendant le calcul. Relancez le solveur.",
      });
    }

    const inserted = (
      await transaction
        .insert(solutions)
        .values({ id: newId("solution"), classroomId, result, createdAt: now })
        .returning()
    )[0];
    if (!inserted) throw new ORPCError("INTERNAL_SERVER_ERROR");

    const history = await transaction
      .select({ id: solutions.id })
      .from(solutions)
      .where(eq(solutions.classroomId, classroomId))
      .orderBy(desc(solutions.createdAt))
      .limit(1_000);
    const expired = [
      { id: inserted.id },
      ...history.filter(({ id }) => id !== inserted.id),
    ].slice(50);
    if (expired.length > 0) {
      await transaction
        .delete(solutions)
        .where(inArray(solutions.id, expired.map(({ id }) => id)));
    }
    return inserted;
  });
  return parseSolutionRow(row);
}

export function solveClassroomById(database: Database, classroomId: string) {
  return serializeSolve(classroomId, () => solveCurrentClassroom(database, classroomId));
}

export async function solveOwnedClassroom(
  database: Database,
  ownerId: string,
  classroomId: string,
) {
  await getOwnedClassroomRow(database, ownerId, classroomId);
  return solveClassroomById(database, classroomId);
}

export async function getLatestOwnedSolution(
  database: Database,
  ownerId: string,
  classroomId: string,
) {
  await getOwnedClassroomRow(database, ownerId, classroomId);
  const row = await database.query.solutions.findFirst({
    orderBy: desc(solutions.createdAt),
    where: eq(solutions.classroomId, classroomId),
  });
  return { solution: row ? parseSolutionRow(row) : null };
}

export async function getOwnedSolutionHistory(
  database: Database,
  ownerId: string,
  classroomId: string,
) {
  await getOwnedClassroomRow(database, ownerId, classroomId);
  const rows = await database
    .select()
    .from(solutions)
    .where(eq(solutions.classroomId, classroomId))
    .orderBy(desc(solutions.createdAt))
    .limit(50);
  return { items: rows.map(parseSolutionRow) };
}
