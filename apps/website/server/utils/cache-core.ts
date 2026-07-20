import { createHash } from "node:crypto";

export type CacheEntry<T> = {
  value: T;
  createdAt: number;
  expiresAt: number;
};

export type TtlCacheOptions = {
  now?: () => number;
  maxEntries: number;
};

export function createTtlCache<T>(options: TtlCacheOptions) {
  const entries = new Map<string, CacheEntry<T>>();
  const now = options.now ?? Date.now;

  return {
    get(key: string): T | null {
      return this.getEntry(key)?.value ?? null;
    },

    getEntry(key: string): CacheEntry<T> | null {
      const entry = entries.get(key);
      if (!entry) {
        return null;
      }

      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return null;
      }

      return entry;
    },

    set(key: string, value: T, ttlMs: number): void {
      pruneExpired(entries, now());

      if (entries.size >= options.maxEntries) {
        const oldestKey = entries.keys().next().value as string | undefined;
        if (oldestKey) {
          entries.delete(oldestKey);
        }
      }

      entries.set(key, {
        value,
        createdAt: now(),
        expiresAt: now() + ttlMs,
      });
    },

    size(): number {
      pruneExpired(entries, now());
      return entries.size;
    },

    clear(): void {
      entries.clear();
    },
  };
}

export function hashedCacheKey(scope: string, input: unknown): string {
  return createHash("sha256")
    .update(`${scope}:${stableStringify(input)}`)
    .digest("hex");
}

export function stableStringify(input: unknown): string {
  if (input === null || typeof input !== "object") {
    return JSON.stringify(input);
  }

  if (Array.isArray(input)) {
    return `[${input.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = input as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function pruneExpired<T>(
  entries: Map<string, CacheEntry<T>>,
  now: number,
): void {
  for (const [key, entry] of entries.entries()) {
    if (entry.expiresAt <= now) {
      entries.delete(key);
    }
  }
}
