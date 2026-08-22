import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const classrooms = sqliteTable(
  "classrooms",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    published: integer("published", { mode: "boolean" }).notNull().default(false),
    config: text("config", { mode: "json" }).$type<unknown>().notNull(),
    version: integer("version").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(now)
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("classrooms_slug_uidx").on(table.slug),
    index("classrooms_owner_updated_idx").on(table.ownerId, table.updatedAt),
  ],
);

export const formResponses = sqliteTable(
  "form_responses",
  {
    id: text("id").primaryKey(),
    classroomId: text("classroom_id")
      .notNull()
      .references(() => classrooms.id, { onDelete: "cascade" }),
    participantId: text("participant_id").notNull(),
    payload: text("payload", { mode: "json" }).$type<unknown>().notNull(),
    revision: integer("revision").notNull().default(1),
    firstSubmittedAt: integer("first_submitted_at", { mode: "timestamp_ms" })
      .notNull()
      .default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(now)
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("form_responses_classroom_participant_uidx").on(
      table.classroomId,
      table.participantId,
    ),
    index("form_responses_classroom_updated_idx").on(table.classroomId, table.updatedAt),
  ],
);

export const solutions = sqliteTable(
  "solutions",
  {
    id: text("id").primaryKey(),
    classroomId: text("classroom_id")
      .notNull()
      .references(() => classrooms.id, { onDelete: "cascade" }),
    result: text("result", { mode: "json" }).$type<unknown>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [index("solutions_classroom_created_idx").on(table.classroomId, table.createdAt)],
);

export const classroomRelations = relations(classrooms, ({ many, one }) => ({
  owner: one(user, {
    fields: [classrooms.ownerId],
    references: [user.id],
  }),
  responses: many(formResponses),
  solutions: many(solutions),
}));

export const formResponseRelations = relations(formResponses, ({ one }) => ({
  classroom: one(classrooms, {
    fields: [formResponses.classroomId],
    references: [classrooms.id],
  }),
}));

export const solutionRelations = relations(solutions, ({ one }) => ({
  classroom: one(classrooms, {
    fields: [solutions.classroomId],
    references: [classrooms.id],
  }),
}));
