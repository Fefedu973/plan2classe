import { describe, expect, test } from "bun:test";

import {
  FixedWindowRateLimiter,
  trustedProxyClientKey,
} from "../src/public-submit-rate-limit";

describe("public submit rate limiter", () => {
  test("ignore les X-Forwarded-For contrôlables par le client", () => {
    expect(trustedProxyClientKey(new Headers({ "x-forwarded-for": "203.0.113.9" }))).toBe(
      "proxy:unknown",
    );
    expect(trustedProxyClientKey(new Headers({ "cf-connecting-ip": "203.0.113.10" }))).toBe(
      "proxy:unknown",
    );
    expect(trustedProxyClientKey(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe(
      "198.51.100.4",
    );
  });

  test("refuse au-delà de la fenêtre et borne strictement la mémoire", () => {
    const limiter = new FixedWindowRateLimiter(2, 60_000, 2);
    expect(limiter.take("a", 1_000).allowed).toBe(true);
    expect(limiter.take("a", 1_001).allowed).toBe(true);
    expect(limiter.take("a", 1_002).allowed).toBe(false);
    limiter.take("b", 1_003);
    limiter.take("c", 1_004);
    expect(limiter.size).toBe(2);
    expect(limiter.take("a", 61_100).allowed).toBe(true);
  });
});
