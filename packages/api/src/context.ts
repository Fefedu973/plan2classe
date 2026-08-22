import { auth } from "@plan2classe-app/auth";
import { db, type Database } from "@plan2classe-app/db";
import type { Context as HonoContext } from "hono";

export type CreateContextOptions = {
  context: HonoContext;
  database?: Database;
};

export async function createContext({ context, database = db }: CreateContextOptions) {
  const session = await auth.api.getSession({
    headers: context.req.raw.headers,
  });
  return {
    auth,
    database,
    request: {
      ip:
        context.req.header("x-real-ip") ?? "proxy:unknown",
    },
    session,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
