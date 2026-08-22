import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { createDb, eq, type Database } from "@plan2classe-app/db";
import { user } from "@plan2classe-app/db/schema/auth";
import { classrooms, formResponses, solutions } from "@plan2classe-app/db/schema/classroom";

import { createDefaultClassroomConfig, createParticipant } from "../src/domain/defaults";
import { classroomConfigSchema, ruleSchema } from "../src/schemas/classroom";
import {
  cleanResponseForConfig,
  getOwnedClassroomBundle,
  updateClassroom,
} from "../src/services/classrooms";
import {
  getPublicClassroom,
  listOwnedResponses,
  submitPublicResponse,
} from "../src/services/responses";
import { solveOwnedClassroom } from "../src/services/solver";

const schemaSql = `
PRAGMA foreign_keys = ON;
CREATE TABLE user (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  email_verified integer DEFAULT false NOT NULL,
  image text,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);
CREATE TABLE classrooms (
  id text PRIMARY KEY NOT NULL,
  owner_id text NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text DEFAULT '' NOT NULL,
  published integer DEFAULT false NOT NULL,
  config text NOT NULL,
  version integer DEFAULT 1 NOT NULL,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);
CREATE TABLE form_responses (
  id text PRIMARY KEY NOT NULL,
  classroom_id text NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  participant_id text NOT NULL,
  payload text NOT NULL,
  revision integer DEFAULT 1 NOT NULL,
  first_submitted_at integer NOT NULL,
  updated_at integer NOT NULL
);
CREATE UNIQUE INDEX form_responses_classroom_participant_uidx
  ON form_responses(classroom_id, participant_id);
CREATE TABLE solutions (
  id text PRIMARY KEY NOT NULL,
  classroom_id text NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  result text NOT NULL,
  created_at integer NOT NULL
);
`;

let database: Database;
let config: ReturnType<typeof classroomConfigSchema.parse>;
const originalFetch = globalThis.fetch;

beforeEach(async () => {
  database = createDb({ url: "file::memory:?cache=shared" });
  await database.$client.executeMultiple(schemaSql);
  const now = new Date();
  await database.insert(user).values([
    {
      id: "teacher-a",
      name: "Prof A",
      email: "a@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "teacher-b",
      name: "Prof B",
      email: "b@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
  ]);
  const participant = createParticipant("Alice");
  config = classroomConfigSchema.parse({
    ...createDefaultClassroomConfig("blank"),
    participants: [participant],
    settings: {
      ...createDefaultClassroomConfig("blank").settings,
      auto_solve_on_response: false,
    },
  });
  await database.insert(classrooms).values({
    id: "class-a",
    ownerId: "teacher-a",
    name: "Sixième A",
    slug: "sixieme-a",
    description: "Formulaire test",
    published: true,
    config,
    createdAt: now,
    updatedAt: now,
  });
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  await database.$client.executeMultiple(`
    DROP TABLE IF EXISTS solutions;
    DROP TABLE IF EXISTS form_responses;
    DROP TABLE IF EXISTS classrooms;
    DROP TABLE IF EXISTS user;
  `);
  database.$client.close();
});

describe("isolation propriétaire", () => {
  test("une classe étrangère reste indistinguable d’une classe inexistante", async () => {
    await expect(getOwnedClassroomBundle(database, "teacher-b", "class-a")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      updateClassroom(database, "teacher-b", { id: "class-a", name: "Volée" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("formulaire public", () => {
  test("le payload ne révèle ni codes, ni règles, ni répondants", async () => {
    const payload = await getPublicClassroom(database, "sixieme-a");
    const serialized = JSON.stringify(payload);
    expect(payload.participants).toEqual([{ id: config.participants[0]!.id, name: "Alice" }]);
    expect(serialized).not.toContain(config.participants[0]?.accessCode ?? "missing");
    expect(serialized).not.toContain("previous_assignment");
    expect(serialized).not.toContain("rules");
    expect(serialized).not.toContain("response_received");
  });

  test("une révision conserve firstSubmittedAt et incrémente revision", async () => {
    const participantId = config.participants[0]!.id;
    const seatId = config.room.seats[0]!.id;
    const response = {
      participant_id: participantId,
      seat_ranking: [seatId],
      zone_ranking: ["front"],
      desired_neighbors: [],
      avoided_neighbors: [],
      priority_mode: "seat" as const,
      notes: "première version",
    };
    expect((await submitPublicResponse(database, { slug: "sixieme-a", response })).revision).toBe(1);
    const first = await database.query.formResponses.findFirst();
    expect(first).toBeDefined();
    const firstTime = first!.firstSubmittedAt.getTime();

    expect(
      (
        await submitPublicResponse(database, {
          slug: "sixieme-a",
          response: { ...response, notes: "révision" },
        })
      ).revision,
    ).toBe(2);
    const revised = await database.query.formResponses.findFirst();
    expect(revised!.firstSubmittedAt.getTime()).toBe(firstTime);
    expect(revised!.revision).toBe(2);
    expect((revised!.payload as { submitted_at: string }).submitted_at).toBe(
      revised!.firstSubmittedAt.toISOString(),
    );
  });

  test("le nettoyage CAS conserve une soumission arrivée après sa lecture", async () => {
    const participantId = config.participants[0]!.id;
    const obsoleteSeatId = config.room.seats[0]!.id;
    const recentSeatId = config.room.seats[1]!.id;
    const response = {
      participant_id: participantId,
      seat_ranking: [obsoleteSeatId],
      zone_ranking: [],
      desired_neighbors: [],
      avoided_neighbors: [],
      priority_mode: "none" as const,
      notes: "ancienne réponse",
    };

    await submitPublicResponse(database, { slug: "sixieme-a", response });
    const staleRow = await database.query.formResponses.findFirst();
    expect(staleRow).toBeDefined();

    const nextConfig = classroomConfigSchema.parse({
      ...config,
      room: {
        ...config.room,
        seats: config.room.seats.map((seat) =>
          seat.id === obsoleteSeatId ? { ...seat, enabled: false } : seat,
        ),
      },
    });
    const classroomBeforeEdit = await database.query.classrooms.findFirst();
    await database
      .update(classrooms)
      .set({
        config: nextConfig,
        version: classroomBeforeEdit!.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(classrooms.id, "class-a"));

    await submitPublicResponse(database, {
      slug: "sixieme-a",
      response: {
        ...response,
        seat_ranking: [recentSeatId],
        notes: "réponse récente",
      },
    });

    // The cleaner starts from the stale revision it captured before the newer
    // submission. Its first CAS must miss, forcing a re-read of revision 2.
    await cleanResponseForConfig(database, nextConfig, "class-a", staleRow!);

    const listed = await listOwnedResponses(database, "teacher-a", "class-a");
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]!.revision).toBe(2);
    expect(listed.items[0]!.response.notes).toBe("réponse récente");
    expect(listed.items[0]!.response.seat_ranking).toEqual([recentSeatId]);

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          status: "optimal",
          assignment: { [participantId]: recentSeatId },
          people: [
            {
              participant_id: participantId,
              seat_id: recentSeatId,
              satisfaction: 1000,
              raw_score: 100,
              response_received: true,
              moved_from_previous: false,
              breakdown: [],
            },
          ],
          stages: [],
          min_satisfaction: 1000,
          average_satisfaction: 1000,
          weighted_total: 100,
          unchanged_count: 0,
          diagnostics: [],
          hard_constraints_verified: true,
          generated_at: new Date().toISOString(),
          solver: "test",
          model_stats: {},
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;

    await expect(solveOwnedClassroom(database, "teacher-a", "class-a")).resolves.toMatchObject({
      result: { assignment: { [participantId]: recentSeatId } },
    });
  });

  test("le mode code utilise le code du participant ciblé", async () => {
    const securedConfig = classroomConfigSchema.parse({
      ...config,
      form: { ...config.form, accessMode: "code" },
    });
    await database.update(classrooms).set({ config: securedConfig });
    const response = {
      participant_id: config.participants[0]!.id,
      seat_ranking: [],
      zone_ranking: [],
      desired_neighbors: [],
      avoided_neighbors: [],
      priority_mode: "none" as const,
      notes: "",
    };
    await expect(
      submitPublicResponse(database, { slug: "sixieme-a", accessCode: "WRONG", response }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      submitPublicResponse(database, {
        slug: "sixieme-a",
        accessCode: config.participants[0]!.accessCode.toLowerCase(),
        response,
      }),
    ).resolves.toMatchObject({ saved: true, revision: 1 });
  });
});

describe("validation et solveur", () => {
  test("les paramètres des règles compactes sont validés par kind", () => {
    expect(
      ruleSchema.safeParse({
        id: "rule-1",
        name: "No go vide",
        kind: "no_go",
        hard: true,
        weight: 100,
        enabled: true,
        source: "admin",
        explanation: "",
        params: { participant_id: config.participants[0]!.id, seat_ids: [], tags: [] },
      }).success,
    ).toBe(false);
  });

  test("un résultat valide est historisé et devient l’affectation précédente", async () => {
    const participantId = config.participants[0]!.id;
    const seatId = config.room.seats[0]!.id;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          status: "optimal",
          assignment: { [participantId]: seatId },
          people: [
            {
              participant_id: participantId,
              seat_id: seatId,
              satisfaction: 1000,
              raw_score: 100,
              response_received: false,
              moved_from_previous: false,
              breakdown: [],
            },
          ],
          stages: [],
          min_satisfaction: 1000,
          average_satisfaction: 1000,
          weighted_total: 100,
          unchanged_count: 0,
          diagnostics: [],
          hard_constraints_verified: true,
          generated_at: new Date().toISOString(),
          solver: "test",
          model_stats: {},
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;

    const solution = await solveOwnedClassroom(database, "teacher-a", "class-a");
    expect(solution.result.assignment).toEqual({ [participantId]: seatId });
    const classroom = await database.query.classrooms.findFirst();
    expect((classroom!.config as typeof config).previous_assignment).toEqual({
      [participantId]: seatId,
    });
    expect(await database.select().from(formResponses)).toHaveLength(0);

    const solvedConfig = classroomConfigSchema.parse(classroom!.config);
    await updateClassroom(database, "teacher-a", {
      id: "class-a",
      config: {
        ...solvedConfig,
        form: { ...solvedConfig.form, title: "Formulaire renommé" },
        previous_assignment: {},
      },
    });
    const afterFormEdit = await database.query.classrooms.findFirst();
    expect((afterFormEdit!.config as typeof config).previous_assignment).toEqual({
      [participantId]: seatId,
    });
    expect(await database.select().from(solutions)).toHaveLength(1);

    const currentConfig = classroomConfigSchema.parse(afterFormEdit!.config);
    await updateClassroom(database, "teacher-a", {
      id: "class-a",
      config: {
        ...currentConfig,
        room: {
          ...currentConfig.room,
          seats: currentConfig.room.seats.map((seat) =>
            seat.id === seatId ? { ...seat, enabled: false } : seat,
          ),
        },
      },
    });
    const afterStructuralEdit = await database.query.classrooms.findFirst();
    expect((afterStructuralEdit!.config as typeof config).previous_assignment).toEqual({});
    expect(await database.select().from(solutions)).toHaveLength(0);
  });

  test("un calcul en vol ne peut pas écraser une configuration plus récente", async () => {
    const participantId = config.participants[0]!.id;
    const seatId = config.room.seats[0]!.id;
    let signalStarted!: () => void;
    let releaseSolver!: () => void;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const held = new Promise<void>((resolve) => {
      releaseSolver = resolve;
    });
    globalThis.fetch = (async () => {
      signalStarted();
      await held;
      return new Response(
        JSON.stringify({
          status: "optimal",
          assignment: { [participantId]: seatId },
          people: [
            {
              participant_id: participantId,
              seat_id: seatId,
              satisfaction: 1000,
              raw_score: 100,
              response_received: false,
              moved_from_previous: false,
              breakdown: [],
            },
          ],
          stages: [],
          min_satisfaction: 1000,
          average_satisfaction: 1000,
          weighted_total: 100,
          unchanged_count: 0,
          diagnostics: [],
          hard_constraints_verified: true,
          generated_at: new Date().toISOString(),
          solver: "test",
          model_stats: {},
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const solving = solveOwnedClassroom(database, "teacher-a", "class-a");
    await started;
    const beforeEdit = await database.query.classrooms.findFirst();
    const beforeConfig = classroomConfigSchema.parse(beforeEdit!.config);
    await updateClassroom(database, "teacher-a", {
      id: "class-a",
      config: {
        ...beforeConfig,
        form: { ...beforeConfig.form, title: "Configuration concurrente" },
      },
    });
    releaseSolver();

    await expect(solving).rejects.toMatchObject({ code: "CONFLICT" });
    const after = await database.query.classrooms.findFirst();
    expect(classroomConfigSchema.parse(after!.config).form.title).toBe(
      "Configuration concurrente",
    );
    expect(await database.select().from(solutions)).toHaveLength(0);
  });
});
