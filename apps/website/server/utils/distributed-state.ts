import type { CacheEntry } from "./cache-core.js";
import type { RateLimitDecision, RateLimitOptions } from "./rate-limit-core.js";

type RedisRestResult<T> = {
  result: T;
};

type RedisRestConfig = {
  url: string;
  token: string;
};

export type DistributedStateStatus = {
  configured: boolean;
  provider: "redis-rest" | "memory";
};

export function distributedStateStatus(): DistributedStateStatus {
  return redisRestConfig()
    ? { configured: true, provider: "redis-rest" }
    : { configured: false, provider: "memory" };
}

export async function getDistributedCacheEntry<T>(
  key: string,
): Promise<CacheEntry<T> | null> {
  const config = redisRestConfig();
  if (!config) return null;

  const result = await redisCommand<string | null>(config, [
    "GET",
    cacheKey(key),
  ]);
  if (!result) return null;

  try {
    const entry = JSON.parse(result) as CacheEntry<T>;
    if (
      typeof entry.createdAt !== "number" ||
      typeof entry.expiresAt !== "number" ||
      entry.expiresAt <= Date.now()
    ) {
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

export async function setDistributedCacheEntry<T>(
  key: string,
  value: T,
  ttlMs: number,
): Promise<void> {
  const config = redisRestConfig();
  if (!config) return;

  const createdAt = Date.now();
  const entry: CacheEntry<T> = {
    value,
    createdAt,
    expiresAt: createdAt + ttlMs,
  };
  await redisCommand(config, [
    "SET",
    cacheKey(key),
    JSON.stringify(entry),
    "PX",
    String(ttlMs),
  ]);
}

export async function checkDistributedRateLimit(
  options: RateLimitOptions,
): Promise<RateLimitDecision | null> {
  const config = redisRestConfig();
  if (!config) return null;

  const now = options.now ?? Date.now();
  const bucket = Math.floor(now / options.windowMs);
  const resetAt = (bucket + 1) * options.windowMs;
  const key = [
    "powerrr",
    "rate",
    options.scope,
    options.subject ?? "anonymous",
    bucket,
  ].join(":");
  const results = await redisPipeline<[unknown, number]>(config, [
    ["SET", key, "0", "PX", String(options.windowMs * 2), "NX"],
    ["INCR", key],
  ]);
  const count = Number(results[1] ?? 0);

  return {
    allowed: count <= options.limit,
    remaining: Math.max(0, options.limit - count),
    resetAt,
  };
}

async function redisCommand<TResult>(
  config: RedisRestConfig,
  command: string[],
): Promise<TResult> {
  const response = await redisFetch(config, config.url, command);
  const payload = (await response.json()) as RedisRestResult<TResult>;
  return payload.result;
}

async function redisPipeline<TResult extends unknown[]>(
  config: RedisRestConfig,
  commands: string[][],
): Promise<TResult> {
  const response = await redisFetch(config, `${config.url}/pipeline`, commands);
  const payload = (await response.json()) as Array<RedisRestResult<unknown>>;
  return payload.map((item) => item.result) as TResult;
}

async function redisFetch(
  config: RedisRestConfig,
  url: string,
  body: unknown,
): Promise<Response> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(1_500),
  });
  if (!response.ok) {
    throw new Error(`Distributed state returned HTTP ${response.status}`);
  }
  return response;
}

function redisRestConfig(): RedisRestConfig | null {
  const url = (
    process.env.POWERRR_REDIS_REST_URL ??
    process.env.UPSTASH_REDIS_REST_URL ??
    ""
  )
    .trim()
    .replace(/\/$/, "");
  const token = (
    process.env.POWERRR_REDIS_REST_TOKEN ??
    process.env.UPSTASH_REDIS_REST_TOKEN ??
    ""
  ).trim();
  return url && token ? { url, token } : null;
}

function cacheKey(key: string): string {
  return `powerrr:cache:${key}`;
}
