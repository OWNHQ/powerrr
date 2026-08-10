import { describe, expect, it } from "vitest";
import { DeadlineExceededError, withDeadline } from "./promise-deadline.js";

describe("promise deadlines", () => {
  it("returns a source result that settles before its deadline", async () => {
    await expect(
      withDeadline(Promise.resolve("ready"), 50, "late"),
    ).resolves.toBe("ready");
  });

  it("rejects a source that never settles", async () => {
    let cancelled = false;
    const pending = withDeadline(
      new Promise<never>(() => undefined),
      5,
      "source timed out",
      { onDeadline: () => (cancelled = true) },
    );
    await expect(pending).rejects.toBeInstanceOf(DeadlineExceededError);
    expect(cancelled).toBe(true);
  });
});
