import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { createContext } from "@plan2classe-app/api/context";
import { appRouter } from "@plan2classe-app/api/routers/index";
import { auth } from "@plan2classe-app/auth";
import { env } from "@plan2classe-app/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { FixedWindowRateLimiter, trustedProxyClientKey } from "./public-submit-rate-limit";

const app = new Hono();
const publicSubmitRateLimiter = new FixedWindowRateLimiter(
  env.PUBLIC_SUBMIT_RATE_LIMIT,
  env.PUBLIC_SUBMIT_RATE_WINDOW_MS,
);

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.use("/*", async (c, next) => {
  const isPublicSubmission =
    c.req.method === "POST" &&
    (c.req.path === "/rpc/publicClassroom/submit" ||
      c.req.path === "/api-reference/publicClassroom/submit");
  if (!isPublicSubmission) return next();

  const decision = publicSubmitRateLimiter.take(trustedProxyClientKey(c.req.raw.headers));
  if (!decision.allowed) {
    c.header("Retry-After", String(decision.retryAfterSeconds));
    return c.json({ error: "Trop de soumissions. Réessayez dans un instant." }, 429);
  }
  return next();
});

app.get("/", (c) => c.text("OK"));
app.get("/health", (c) =>
  c.json({ status: "ok", service: "plan2classe-api", timestamp: new Date().toISOString() }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

export const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

app.use("/*", async (c, next) => {
  const context = await createContext({ context: c });

  const rpcResult = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context: context,
  });

  if (rpcResult.matched) {
    return rpcResult.response as Response;
  }

  const apiResult = await apiHandler.handle(c.req.raw, {
    prefix: "/api-reference",
    context: context,
  });

  if (apiResult.matched) {
    return apiResult.response as Response;
  }

  await next();
});

export default app;
