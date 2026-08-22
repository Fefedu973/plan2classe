import { ORPCError } from "@orpc/server";
import type { formResponses, solutions, classrooms } from "@plan2classe-app/db/schema/classroom";
import type { z } from "zod";

import {
  classroomConfigSchema,
  classroomSchema,
  preferenceResponseSchema,
  solutionRecordSchema,
  solveResultSchema,
  type ClassroomConfig,
} from "../schemas/classroom";

type ClassroomRow = typeof classrooms.$inferSelect;
type ResponseRow = typeof formResponses.$inferSelect;
type SolutionRow = typeof solutions.$inferSelect;

function invalidStoredData(entity: string, cause: unknown): never {
  throw new ORPCError("INTERNAL_SERVER_ERROR", {
    message: `Les données ${entity} enregistrées sont invalides.`,
    cause,
  });
}

export function parseClassroomConfig(value: unknown): ClassroomConfig {
  const parsed = classroomConfigSchema.safeParse(value);
  if (!parsed.success) invalidStoredData("de la classe", parsed.error);
  const people = new Set(parsed.data.participants.map((participant) => participant.id));
  const seats = new Set(
    parsed.data.room.seats.filter((seat) => seat.enabled).map((seat) => seat.id),
  );
  if (
    Object.entries(parsed.data.previous_assignment).some(
      ([participantId, seatId]) => !people.has(participantId) || !seats.has(seatId),
    )
  ) {
    invalidStoredData("de la classe", new Error("Invalid previous_assignment references"));
  }
  return parsed.data;
}

export function serializeClassroom(row: ClassroomRow) {
  const value = {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    published: row.published,
    config: parseClassroomConfig(row.config),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  return classroomSchema.parse(value);
}

export function parseResponseRow(row: ResponseRow) {
  const response = preferenceResponseSchema.safeParse(row.payload);
  if (!response.success) invalidStoredData("de réponse", response.error);
  if (
    response.data.participant_id !== row.participantId ||
    response.data.revision !== row.revision ||
    new Date(response.data.submitted_at).getTime() !== row.firstSubmittedAt.getTime()
  ) {
    invalidStoredData("de réponse", new Error("Response metadata mismatch"));
  }
  return {
    id: row.id,
    classroomId: row.classroomId,
    participantId: row.participantId,
    response: response.data,
    revision: row.revision,
    firstSubmittedAt: row.firstSubmittedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function parseSolutionRow(row: SolutionRow) {
  const result = solveResultSchema.safeParse(row.result);
  if (!result.success) invalidStoredData("de solution", result.error);
  return solutionRecordSchema.parse({
    id: row.id,
    classroomId: row.classroomId,
    result: result.data,
    createdAt: row.createdAt.toISOString(),
  });
}

export function parseInput<TSchema extends z.ZodType>(schema: TSchema, value: unknown): z.output<TSchema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Les données envoyées sont invalides.",
      data: { issues: parsed.error.issues },
    });
  }
  return parsed.data;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

export function structuralConfigFingerprint(config: ClassroomConfig): string {
  const { form: _form, previous_assignment: _previousAssignment, settings, ...rest } = config;
  const { auto_solve_on_response: _autoSolve, ...solverSettings } = settings;
  const participants = rest.participants.map(({ accessCode: _accessCode, ...participant }) => participant);
  return JSON.stringify(stableValue({ ...rest, participants, settings: solverSettings }));
}

export function normalizeSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}
