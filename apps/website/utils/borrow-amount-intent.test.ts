import { describe, expect, it } from "vitest";
import {
  amountForBorrowIntent,
  relativeIntentForAmount,
  selectedCollateralSignature,
} from "./borrow-amount-intent.js";

describe("borrow amount intent", () => {
  it("recalculates a relative scenario against a changed provider maximum", () => {
    expect(
      amountForBorrowIntent(
        { kind: "relative", utilizationPercent: 50 },
        27.89,
        6_680,
      ),
    ).toBe(13.95);
  });

  it("preserves a manually entered absolute amount", () => {
    expect(amountForBorrowIntent({ kind: "absolute" }, 27.89, 6_680)).toBe(
      6_680,
    );
  });

  it.each([25, 50, 75])(
    "retains a %s%% scenario when the ceiling changes",
    (utilizationPercent) => {
      expect(
        amountForBorrowIntent({ kind: "relative", utilizationPercent }, 200, 1),
      ).toBe((200 * utilizationPercent) / 100);
    },
  );

  it("records a slider value as a relative percentage", () => {
    expect(relativeIntentForAmount(30, 120)).toEqual({
      kind: "relative",
      utilizationPercent: 25,
    });
  });

  it("makes selection comparison insensitive to order and address casing", () => {
    expect(selectedCollateralSignature(["0xBb", "0xAA", "0xaa"])).toBe(
      selectedCollateralSignature(["0xAA", "0xBB"]),
    );
  });
});
