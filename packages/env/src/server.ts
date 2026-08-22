import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const isTest = process.env.NODE_ENV === "test";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    SOLVER_URL: z.url(),
    SOLVER_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(660_000).default(45_000),
    PUBLIC_SUBMIT_RATE_LIMIT: z.coerce.number().int().min(1).max(1_000).default(20),
    PUBLIC_SUBMIT_RATE_WINDOW_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(3_600_000)
      .default(60_000),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  runtimeEnv: {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL ?? (isTest ? "file::memory:" : undefined),
    BETTER_AUTH_SECRET:
      process.env.BETTER_AUTH_SECRET ??
      (isTest ? "test-only-secret-that-is-at-least-32-characters" : undefined),
    BETTER_AUTH_URL:
      process.env.BETTER_AUTH_URL ?? (isTest ? "http://localhost:3000" : undefined),
    CORS_ORIGIN: process.env.CORS_ORIGIN ?? (isTest ? "http://localhost:3001" : undefined),
    SOLVER_URL: process.env.SOLVER_URL ?? (isTest ? "http://solver.test" : undefined),
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
