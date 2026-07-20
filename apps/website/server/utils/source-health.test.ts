import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSourceReadHealthForTests,
  recordSourceRead,
  sourceReadHealthSnapshot,
} from "./source-health.js";

beforeEach(clearSourceReadHealthForTests);

describe("source read health", () => {
  it("retains the last success when a later provider read fails", () => {
    recordSourceRead({
      sourceId: "aave-v3",
      success: true,
      durationMs: 125.4,
      at: new Date("2026-07-20T12:00:00.000Z"),
    });
    recordSourceRead({
      sourceId: "aave-v3",
      success: false,
      durationMs: 3_500,
      code: "DEADLINE_EXCEEDED",
      at: new Date("2026-07-20T12:01:00.000Z"),
    });

    expect(sourceReadHealthSnapshot()).toEqual([
      {
        sourceId: "aave-v3",
        lastAttemptAt: "2026-07-20T12:01:00.000Z",
        lastSuccessAt: "2026-07-20T12:00:00.000Z",
        lastDurationMs: 3_500,
        status: "unavailable",
        code: "DEADLINE_EXCEEDED",
      },
    ]);
  });
});
