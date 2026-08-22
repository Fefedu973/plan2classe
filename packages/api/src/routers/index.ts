import type { RouterClient } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure, publicProcedure } from "../index";
import { classroomConfigSchema, publicSubmitSchema } from "../schemas/classroom";
import { getOwnedAnalytics } from "../services/analytics";
import {
  createClassroom,
  deleteClassroom,
  duplicateClassroom,
  getOwnedClassroomBundle,
  listOwnedClassrooms,
  updateClassroom,
} from "../services/classrooms";
import {
  getPublicClassroom,
  listOwnedResponses,
  resetOwnedResponses,
  submitPublicResponse,
} from "../services/responses";
import {
  getLatestOwnedSolution,
  getOwnedSolutionHistory,
  solveOwnedClassroom,
} from "../services/solver";

const classroomIdInput = z.object({ classroomId: z.string().min(1) });
const idInput = z.object({ id: z.string().min(1) });

export const appRouter = {
  classroom: {
    list: protectedProcedure.handler(({ context }) =>
      listOwnedClassrooms(context.database, context.session.user.id),
    ),
    get: protectedProcedure.input(idInput).handler(({ context, input }) =>
      getOwnedClassroomBundle(context.database, context.session.user.id, input.id),
    ),
    create: protectedProcedure
      .input(
        z.object({
          name: z.string().trim().min(1).max(180),
          description: z.string().max(2_000).optional(),
          template: z.enum(["blank", "demo"]),
        }),
      )
      .handler(({ context, input }) =>
        createClassroom(context.database, context.session.user.id, input),
      ),
    update: protectedProcedure
      .input(
        z.object({
          id: z.string().min(1),
          name: z.string().trim().min(1).max(180).optional(),
          slug: z.string().trim().min(1).max(100).optional(),
          description: z.string().max(2_000).optional(),
          published: z.boolean().optional(),
          config: classroomConfigSchema.optional(),
        }),
      )
      .handler(({ context, input }) =>
        updateClassroom(context.database, context.session.user.id, input),
      ),
    delete: protectedProcedure.input(idInput).handler(({ context, input }) =>
      deleteClassroom(context.database, context.session.user.id, input.id),
    ),
    duplicate: protectedProcedure
      .input(
        z.object({
          id: z.string().min(1),
          name: z.string().trim().min(1).max(180).optional(),
        }),
      )
      .handler(({ context, input }) =>
        duplicateClassroom(context.database, context.session.user.id, input),
      ),
  },
  response: {
    list: protectedProcedure.input(classroomIdInput).handler(({ context, input }) =>
      listOwnedResponses(context.database, context.session.user.id, input.classroomId),
    ),
    reset: protectedProcedure.input(classroomIdInput).handler(({ context, input }) =>
      resetOwnedResponses(context.database, context.session.user.id, input.classroomId),
    ),
  },
  analytics: {
    get: protectedProcedure.input(classroomIdInput).handler(({ context, input }) =>
      getOwnedAnalytics(context.database, context.session.user.id, input.classroomId),
    ),
  },
  solution: {
    latest: protectedProcedure.input(classroomIdInput).handler(({ context, input }) =>
      getLatestOwnedSolution(context.database, context.session.user.id, input.classroomId),
    ),
    history: protectedProcedure.input(classroomIdInput).handler(({ context, input }) =>
      getOwnedSolutionHistory(context.database, context.session.user.id, input.classroomId),
    ),
    solve: protectedProcedure.input(classroomIdInput).handler(async ({ context, input }) => ({
      solution: await solveOwnedClassroom(
        context.database,
        context.session.user.id,
        input.classroomId,
      ),
    })),
  },
  publicClassroom: {
    get: publicProcedure
      .input(z.object({ slug: z.string().min(1).max(100) }))
      .handler(({ context, input }) => getPublicClassroom(context.database, input.slug)),
    submit: publicProcedure
      .input(publicSubmitSchema)
      .handler(({ context, input }) => submitPublicResponse(context.database, input)),
  },
  healthCheck: publicProcedure.handler(() => ({ status: "ok" as const })),
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
