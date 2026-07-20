import { setHeader, type H3Event } from "h3";
import { createTtlCache, hashedCacheKey } from "./cache-core.js";
import {
  getDistributedCacheEntry,
  setDistributedCacheEntry,
} from "./distributed-state.js";

type CachePolicy = {
  scope: string;
  ttlMs: number;
  subject: unknown;
};

const responseCache = createTtlCache<unknown>({
  maxEntries: 500,
});
const inFlight = new Map<string, Promise<unknown>>();

export async function cachedResponse<T>(
  event: H3Event,
  policy: CachePolicy,
  loader: () => Promise<T>,
): Promise<T> {
  const key = hashedCacheKey(policy.scope, policy.subject);
  const memoryCached = responseCache.getEntry(key);
  const cached =
    memoryCached ??
    (await getDistributedCacheEntry<unknown>(key).catch((error) => {
      logDistributedStateFailure("cache.read", error);
      return null;
    }));

  if (cached !== null) {
    if (!memoryCached) {
      responseCache.set(
        key,
        cached.value,
        Math.max(1, cached.expiresAt - Date.now()),
      );
    }
    setHeader(event, "x-powerrr-cache", "HIT");
    const ageSeconds = Math.max(
      0,
      Math.floor((Date.now() - cached.createdAt) / 1_000),
    );
    setHeader(event, "x-powerrr-cache-age", String(ageSeconds));
    return withDeliveryMetadata(cached.value as T, "hit", ageSeconds);
  }

  const pending = inFlight.get(key);
  if (pending) {
    setHeader(event, "x-powerrr-cache", "COALESCED");
    const value = (await pending) as T;
    return withDeliveryMetadata(value, "hit", 0);
  }

  const operation = loader();
  inFlight.set(key, operation);
  let value: T;
  try {
    value = await operation;
  } finally {
    inFlight.delete(key);
  }
  responseCache.set(key, value, policy.ttlMs);
  await setDistributedCacheEntry(key, value, policy.ttlMs).catch((error) => {
    logDistributedStateFailure("cache.write", error);
  });
  setHeader(event, "x-powerrr-cache", "MISS");
  setHeader(event, "x-powerrr-cache-age", "0");
  return withDeliveryMetadata(value, "miss", 0);
}

function logDistributedStateFailure(
  operation: "cache.read" | "cache.write",
  error: unknown,
): void {
  console.warn(
    JSON.stringify({
      event: "distributed-state.failed",
      operation,
      errorCategory: error instanceof Error ? error.name : "unknown",
    }),
  );
}

export function clearResponseCacheForTests(): void {
  responseCache.clear();
  inFlight.clear();
}

function withDeliveryMetadata<T>(
  value: T,
  status: "hit" | "miss",
  ageSeconds: number,
): T {
  if (!value || typeof value !== "object" || !("cache" in value)) {
    return value;
  }

  return {
    ...value,
    servedAt: new Date().toISOString(),
    cache: {
      status,
      ageSeconds,
    },
  };
}
