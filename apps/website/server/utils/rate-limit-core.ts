import { createHash } from "node:crypto";

export type RateLimitOptions = {
  scope: string;
  limit: number;
  windowMs: number;
  subject?: string | undefined;
  now?: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

export function createMemoryRateLimiter() {
  const buckets = new Map<string, Bucket>();

  return {
    check(options: RateLimitOptions): RateLimitDecision {
      const now = options.now ?? Date.now();
      const key = hashRateLimitKey(
        options.scope,
        options.subject ?? "anonymous",
      );
      const current = buckets.get(key);

      if (!current || current.resetAt <= now) {
        buckets.set(key, {
          count: 1,
          resetAt: now + options.windowMs,
        });

        return {
          allowed: true,
          remaining: options.limit - 1,
          resetAt: now + options.windowMs,
        };
      }

      if (current.count >= options.limit) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: current.resetAt,
        };
      }

      current.count += 1;
      return {
        allowed: true,
        remaining: options.limit - current.count,
        resetAt: current.resetAt,
      };
    },

    size(): number {
      return buckets.size;
    },

    clear(): void {
      buckets.clear();
    },
  };
}

function hashRateLimitKey(scope: string, subject: string): string {
  return createHash("sha256").update(`${scope}:${subject}`).digest("hex");
}
