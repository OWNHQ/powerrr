import { describe, expect, it } from "vitest";
import { createMemoryRateLimiter } from "./rate-limit-core.js";

describe("Nuxt API rate limiter", () => {
  it("limits requests by hashed scope and subject, then resets by window", () => {
    const limiter = createMemoryRateLimiter();
    const first = limiter.check({
      scope: "public:quotes",
      subject: "ip:wallet",
      limit: 2,
      windowMs: 1_000,
      now: 10_000,
    });
    const second = limiter.check({
      scope: "public:quotes",
      subject: "ip:wallet",
      limit: 2,
      windowMs: 1_000,
      now: 10_100,
    });
    const third = limiter.check({
      scope: "public:quotes",
      subject: "ip:wallet",
      limit: 2,
      windowMs: 1_000,
      now: 10_200,
    });
    const afterReset = limiter.check({
      scope: "public:quotes",
      subject: "ip:wallet",
      limit: 2,
      windowMs: 1_000,
      now: 11_001,
    });

    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(1);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);
    expect(third.allowed).toBe(false);
    expect(afterReset.allowed).toBe(true);
    expect(afterReset.remaining).toBe(1);
    expect(limiter.size()).toBe(1);
  });
});
