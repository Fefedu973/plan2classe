import { createHash } from "node:crypto";

import { createDb, type Database } from "@plan2classe-app/db";
import * as schema from "@plan2classe-app/db/schema/auth";
import { env } from "@plan2classe-app/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { username } from "better-auth/plugins";

function localAccountEmail(rawUsername: string): string {
  const username = rawUsername.trim().toLowerCase();
  const identifier = createHash("sha256").update(username, "utf8").digest("hex").slice(0, 40);
  return `u-${identifier}@accounts.plan2classe.invalid`;
}

export function createAuth(options: { database?: Database } = {}) {
  const db = options.database ?? createDb();
  const production = env.NODE_ENV === "production";

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",

      schema: schema,
    }),
    trustedOrigins: [...new Set([env.CORS_ORIGIN, env.BETTER_AUTH_URL])],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    // Better Auth keeps an email field in its core user model. The application
    // never asks for, sends to, or displays an email: this hook replaces the
    // protocol placeholder with a deterministic, non-deliverable local address.
    hooks: {
      before: createAuthMiddleware(async (context) => {
        // `disabledPaths` uses exact matches. The reset callback has a dynamic
        // token segment, so it must be rejected explicitly as a prefix.
        if (context.path.startsWith("/reset-password/")) {
          throw new APIError("NOT_FOUND", { message: "Cette route n'est pas disponible." });
        }
        if (context.path !== "/sign-up/email") return;
        const rawUsername = context.body?.username;
        if (typeof rawUsername !== "string" || rawUsername.trim().length === 0) {
          throw new APIError("BAD_REQUEST", { message: "Un identifiant est requis." });
        }
        return {
          context: {
            ...context,
            body: {
              ...context.body,
              email: localAccountEmail(rawUsername),
            },
          },
        };
      }),
    },
    disabledPaths: [
      "/sign-in/email",
      "/request-password-reset",
      "/reset-password",
      "/change-email",
      "/send-verification-email",
      "/verify-email",
    ],
    rateLimit: {
      enabled: true,
      window: 60,
      max: 30,
      customRules: {
        "/sign-in/username": { window: 60, max: 8 },
        "/sign-up/email": { window: 300, max: 5 },
      },
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      cookiePrefix: "plan2classe",
      useSecureCookies: production,
      // The Hono container is not published directly; Dokploy/Traefik owns and
      // overwrites this single-value header before forwarding the request.
      ipAddress: { ipAddressHeaders: ["x-real-ip"] },
      defaultCookieAttributes: {
        sameSite: "lax",
        secure: production,
        httpOnly: true,
        path: "/",
      },
    },
    plugins: [
      username({
        displayUsername: false,
        immutableUsername: true,
        minUsernameLength: 3,
        maxUsernameLength: 30,
        usernameValidator: (value) => /^[a-zA-Z0-9_.]+$/.test(value),
      }),
    ],
  });
}

export const auth = createAuth();

export type AuthSession = typeof auth.$Infer.Session;
