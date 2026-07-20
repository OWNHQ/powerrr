import { describe, expect, it } from "vitest";
import {
  createTtlCache,
  hashedCacheKey,
  stableStringify,
} from "./cache-core.js";

describe("server TTL cache", () => {
  it("expires entries by TTL and prunes old values", () => {
    let now = 1_000;
    const cache = createTtlCache<string>({
      maxEntries: 4,
      now: () => now,
    });

    cache.set("a", "value", 500);
    expect(cache.get("a")).toBe("value");

    now = 1_501;
    expect(cache.get("a")).toBeNull();
    expect(cache.size()).toBe(0);
  });

  it("evicts oldest entries when max size is reached", () => {
    const cache = createTtlCache<string>({
      maxEntries: 2,
      now: () => 1_000,
    });

    cache.set("a", "a", 10_000);
    cache.set("b", "b", 10_000);
    cache.set("c", "c", 10_000);

    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")).toBe("b");
    expect(cache.get("c")).toBe("c");
  });

  it("builds stable hashed keys without exposing raw input", () => {
    const left = { input: { ensName: "powerrr.eth" }, chainId: 1 };
    const right = { chainId: 1, input: { ensName: "powerrr.eth" } };

    expect(stableStringify(left)).toBe(stableStringify(right));
    expect(hashedCacheKey("quotes", left)).toBe(
      hashedCacheKey("quotes", right),
    );
    expect(hashedCacheKey("quotes", left)).not.toContain("powerrr");
  });
});
