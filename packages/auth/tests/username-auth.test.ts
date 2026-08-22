import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { createDb, eq, type Database } from "@plan2classe-app/db";
import { user } from "@plan2classe-app/db/schema/auth";

import { createAuth } from "../src/index";

const authSchemaSql = `
PRAGMA foreign_keys = ON;
CREATE TABLE user (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  email_verified integer DEFAULT false NOT NULL,
  username text UNIQUE,
  image text,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);
CREATE TABLE session (
  id text PRIMARY KEY NOT NULL,
  expires_at integer NOT NULL,
  token text NOT NULL UNIQUE,
  created_at integer NOT NULL,
  updated_at integer NOT NULL,
  ip_address text,
  user_agent text,
  user_id text NOT NULL REFERENCES user(id) ON DELETE CASCADE
);
CREATE TABLE account (
  id text PRIMARY KEY NOT NULL,
  issuer text NOT NULL,
  account_id text NOT NULL,
  provider_id text NOT NULL,
  user_id text NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at integer,
  refresh_token_expires_at integer,
  scope text,
  password text,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);
CREATE UNIQUE INDEX account_issuer_accountId_uidx ON account(issuer, account_id);
CREATE TABLE verification (
  id text PRIMARY KEY NOT NULL,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at integer NOT NULL,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);
`;

let database: Database;
let auth: ReturnType<typeof createAuth>;

function request(path: string, body?: unknown, cookie?: string) {
  const origin = process.env.CORS_ORIGIN ?? "http://localhost:3001";
  const authUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const headers = new Headers({ Origin: origin, "x-real-ip": "127.0.0.1" });
  if (body !== undefined) headers.set("content-type", "application/json");
  if (cookie) headers.set("cookie", cookie);
  return new Request(`${authUrl}/api/auth${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function sessionCookie(response: Response): string {
  const header = response.headers.get("set-cookie") ?? "";
  const match = header.match(/(?:__Secure-)?plan2classe\.session_token=[^;,]+/);
  if (!match) throw new Error("Le cookie de session Better Auth est absent.");
  return match[0];
}

beforeEach(async () => {
  database = createDb({ url: "file::memory:" });
  await database.$client.executeMultiple(authSchemaSql);
  auth = createAuth({ database });
});

afterEach(async () => {
  await database.$client.close();
});

describe("authentification locale par identifiant", () => {
  test("crée un compte sans conserver l'e-mail fourni par le client", async () => {
    const missingUsername = await auth.handler(
      request("/sign-up/email", {
        email: "adresse-reelle@example.com",
        name: "Marie Dupont",
        password: "MotDePasse-2026!",
      }),
    );
    expect(missingUsername.status).toBe(400);

    const response = await auth.handler(
      request("/sign-up/email", {
        email: "adresse-reelle@example.com",
        name: "Marie Dupont",
        password: "MotDePasse-2026!",
        username: "Marie.Dupont",
      }),
    );

    expect(response.status).toBe(200);
    const cookieHeader = response.headers.get("set-cookie")?.toLowerCase() ?? "";
    expect(cookieHeader).toContain("httponly");
    expect(cookieHeader).toContain("samesite=lax");
    const payload = (await response.json()) as { user: { username: string } };
    expect(payload.user.username).toBe("marie.dupont");

    const stored = await database.query.user.findFirst({
      where: eq(user.username, "marie.dupont"),
    });
    expect(stored?.email).toMatch(/^u-[a-f0-9]{40}@accounts\.plan2classe\.invalid$/);
    expect(stored?.email).not.toBe("adresse-reelle@example.com");

    const session = await auth.handler(request("/get-session", undefined, sessionCookie(response)));
    expect(session.status).toBe(200);
    expect(((await session.json()) as { user: { username: string } }).user.username).toBe(
      "marie.dupont",
    );
  });

  test("connecte avec l'identifiant et refuse la route de connexion e-mail", async () => {
    const signup = await auth.handler(
      request("/sign-up/email", {
        email: "unused@client.invalid",
        name: "Compte local",
        password: "MotDePasse-2026!",
        username: "compte_local",
      }),
    );
    expect(signup.status).toBe(200);

    const usernameLogin = await auth.handler(
      request("/sign-in/username", {
        username: "COMPTE_LOCAL",
        password: "MotDePasse-2026!",
      }),
    );
    expect(usernameLogin.status).toBe(200);
    expect(((await usernameLogin.json()) as { user: { username: string } }).user.username).toBe(
      "compte_local",
    );

    const emailLogin = await auth.handler(
      request("/sign-in/email", {
        email: "unused@client.invalid",
        password: "MotDePasse-2026!",
      }),
    );
    expect(emailLogin.status).toBe(404);

    const recoveryRequests = [
      request("/request-password-reset", { email: "unused@client.invalid" }),
      request("/reset-password", { newPassword: "NouveauMotDePasse-2026!", token: "fake" }),
      request("/reset-password/fake"),
      request("/send-verification-email", { email: "unused@client.invalid" }),
      request("/change-email", { newEmail: "other@client.invalid" }),
    ];
    for (const recoveryRequest of recoveryRequests) {
      expect((await auth.handler(recoveryRequest)).status).toBe(404);
    }
  });
});
