import type { H3Event } from "h3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cachedResponse,
  clearResponseCacheForTests,
} from "./response-cache.js";

function event(): H3Event {
  return {
    node: {
      res: {
        setHeader: vi.fn(),
      },
    },
  } as unknown as H3Event;
}

describe("response cache refresh", () => {
  beforeEach(() => {
    clearResponseCacheForTests();
    vi.stubGlobal("setHeader", (target: H3Event, name: string, value: string) =>
      target.node.res.setHeader(name, value),
    );
  });

  it("bypasses an existing read and replaces it with a fresh response", async () => {
    let version = 0;
    const loader = async () => ({ version: ++version });
    const policy = { scope: "refresh-test", ttlMs: 15_000, subject: "same" };

    expect(await cachedResponse(event(), policy, loader)).toEqual({
      version: 1,
    });
    expect(await cachedResponse(event(), policy, loader)).toEqual({
      version: 1,
    });
    expect(
      await cachedResponse(event(), { ...policy, bypassRead: true }, loader),
    ).toEqual({ version: 2 });
    expect(await cachedResponse(event(), policy, loader)).toEqual({
      version: 2,
    });
    expect(version).toBe(2);
  });
});
