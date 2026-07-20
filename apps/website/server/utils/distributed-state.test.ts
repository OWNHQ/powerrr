import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkDistributedRateLimit,
  distributedStateStatus,
  getDistributedCacheEntry,
  setDistributedCacheEntry,
} from "./distributed-state.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("distributed serverless state", () => {
  it("reports bounded memory mode when no shared store is configured", () => {
    vi.stubEnv("POWERRR_REDIS_REST_URL", undefined);
    vi.stubEnv("POWERRR_REDIS_REST_TOKEN", undefined);

    expect(distributedStateStatus()).toEqual({
      configured: false,
      provider: "memory",
    });
  });

  it("round-trips cache entries through the Redis REST contract", async () => {
    vi.stubEnv("POWERRR_REDIS_REST_URL", "https://redis.example.test");
    vi.stubEnv("POWERRR_REDIS_REST_TOKEN", "secret");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ result: "OK" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            result: JSON.stringify({
              value: { ok: true },
              createdAt: Date.now(),
              expiresAt: Date.now() + 10_000,
            }),
          }),
          { status: 200 },
        ),
      );

    await setDistributedCacheEntry("quote", { ok: true }, 10_000);
    await expect(getDistributedCacheEntry("quote")).resolves.toMatchObject({
      value: { ok: true },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).not.toContain("secret");
  });

  it("uses fixed distributed buckets for serverless rate limiting", async () => {
    vi.stubEnv("POWERRR_REDIS_REST_URL", "https://redis.example.test");
    vi.stubEnv("POWERRR_REDIS_REST_TOKEN", "secret");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([{ result: "OK" }, { result: 3 }]), {
        status: 200,
      }),
    );

    await expect(
      checkDistributedRateLimit({
        scope: "public:quotes",
        subject: "hashed-subject",
        limit: 3,
        windowMs: 60_000,
        now: 120_001,
      }),
    ).resolves.toEqual({
      allowed: true,
      remaining: 0,
      resetAt: 180_000,
    });
  });
});
