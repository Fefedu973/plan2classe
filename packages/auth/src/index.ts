import { createDb } from "@plan2classe-app/db";
import * as schema from "@plan2classe-app/db/schema/auth";
import { env } from "@plan2classe-app/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export function createAuth() {
  const db = createDb();
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
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      cookiePrefix: "plan2classe",
      useSecureCookies: production,
      defaultCookieAttributes: {
        sameSite: "lax",
        secure: production,
        httpOnly: true,
        path: "/",
      },
    },
    plugins: [],
  });
}

export const auth = createAuth();
