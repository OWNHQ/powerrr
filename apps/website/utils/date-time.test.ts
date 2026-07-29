import { describe, expect, it } from "vitest";
import { formatLocalDateTime } from "./date-time";

describe("local date and time formatting", () => {
  it("uses the requested locale and timezone", () => {
    expect(
      formatLocalDateTime("2027-01-15T08:00:00.000Z", "en-US", "UTC"),
    ).toBe("Jan 15, 2027, 8:00:00 AM");
  });

  it("fails safely for an invalid timestamp", () => {
    expect(formatLocalDateTime("not-a-date", "en-US", "UTC")).toBe(
      "Time unavailable",
    );
  });
});
