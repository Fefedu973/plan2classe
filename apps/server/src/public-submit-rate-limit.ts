export type RateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
};

type RateBucket = { count: number; resetsAt: number };

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, RateBucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxBuckets = 5_000,
  ) {}

  take(key: string, now = Date.now()): RateLimitDecision {
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetsAt <= now) {
      if (bucket) this.buckets.delete(key);
      this.makeRoom(now);
      bucket = { count: 0, resetsAt: now + this.windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    return {
      allowed: bucket.count <= this.limit,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetsAt - now) / 1_000)),
    };
  }

  get size(): number {
    return this.buckets.size;
  }

  private makeRoom(now: number): void {
    if (this.buckets.size < this.maxBuckets) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetsAt <= now) this.buckets.delete(key);
    }
    while (this.buckets.size >= this.maxBuckets) {
      const oldest = this.buckets.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.buckets.delete(oldest);
    }
  }
}

export function trustedProxyClientKey(headers: Headers): string {
  // The origin has no public port in Dokploy. We trust only X-Real-IP because
  // Traefik is configured to overwrite it on the sole ingress path. Cloudflare
  // and X-Forwarded-For headers are deliberately ignored: clients can supply or
  // append them when an origin is accidentally made reachable.
  const value = headers.get("x-real-ip");
  const normalized = value?.trim().slice(0, 64);
  return normalized || "proxy:unknown";
}
