import { describe, expect, it } from "vitest";
import {
  amountForBorrowIntent,
  relativeIntentForAmount,
  selectedCollateralSignature,
} from "./borrow-amount-intent.js";

function usd(value: number) {
  return { raw: BigInt(Math.round(value * 1_000_000)).toString(), decimals: 6 };
}

function usdValue(value: { raw: string; decimals: number }): number {
  return Number(value.raw) / 10 ** value.decimals;
}

describe("borrow amount intent", () => {
  it("recalculates a relative scenario against a changed provider maximum", () => {
    expect(
      usdValue(
        amountForBorrowIntent(
          { kind: "relative", utilizationPercent: 50 },
          usd(27.89),
          usd(6_680),
        ),
      ),
    ).toBe(13.945);
  });

  it("preserves a manually entered absolute amount", () => {
    expect(
      usdValue(
        amountForBorrowIntent({ kind: "absolute" }, usd(27.89), usd(6_680)),
      ),
    ).toBe(6_680);
  });

  it.each([25, 50, 75])(
    "retains a %s%% scenario when the ceiling changes",
    (utilizationPercent) => {
      expect(
        usdValue(
          amountForBorrowIntent(
            { kind: "relative", utilizationPercent },
            usd(200),
            usd(1),
          ),
        ),
      ).toBe((200 * utilizationPercent) / 100);
    },
  );

  it("records a slider value as a relative percentage", () => {
    expect(relativeIntentForAmount(usd(30), usd(120))).toEqual({
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
