import { createClient } from "@libsql/client";
import { env } from "@plan2classe-app/env/server";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema";

export type CreateDbOptions = {
  authToken?: string;
  url?: string;
};

export function createDb(options: CreateDbOptions = {}) {
  const client = createClient({
    authToken: options.authToken,
    url: options.url ?? env.DATABASE_URL,
  });

  return drizzle({ client, schema });
}

export const db = createDb();
export type Database = ReturnType<typeof createDb>;
export { schema };
export { and, count, desc, eq, inArray, ne } from "drizzle-orm";
