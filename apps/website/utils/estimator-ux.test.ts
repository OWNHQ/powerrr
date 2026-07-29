import { describe, expect, it } from "vitest";
import {
  amountForUtilization,
  amountInputStep,
  formatUsdValue,
  friendlyEstimatorError,
  ownFundingStatusLabel,
  ownSupportsRequestedAmount,
  providerRateLabel,
  sortAssetsByUsdValue,
  summarizeEstimatorCapacity,
  utilizationForAmount,
} from "./estimator-ux.js";

describe("estimator UX helpers", () => {
  it.each([
    {
      convention: "apr" as const,
      value: 0.05,
      expected: "5% variable APR",
    },
    {
      convention: "apy" as const,
      value: 0.05127,
      expected: "5.1% variable APY",
    },
  ])("preserves the $convention rate convention in provider copy", (input) => {
    expect(
      providerRateLabel({
        annualRate: {
          value: input.value,
          convention: input.convention,
          rateType: "variable",
          sourceId: "test",
        },
        indicativeApr: null,
        rateType: "variable",
      }),
    ).toBe(input.expected);
  });

  it("keeps the legacy APR fallback explicit", () => {
    expect(
      providerRateLabel({
        annualRate: null,
        indicativeApr: 0.065,
        rateType: "fixed",
      }),
    ).toBe("6.5% fixed APR");
  });

  it.each([
    { maximum: 0.93, percent: 50, expected: 0.465 },
    { maximum: 0.0488889, percent: 100, expected: 0.0488889 },
    { maximum: 75, percent: 50, expected: 37.5 },
    { maximum: 900, percent: 25, expected: 225 },
    { maximum: 100_000, percent: 75, expected: 75_000 },
  ])(
    "keeps amount and utilization accurate for a $maximum maximum",
    ({ maximum, percent, expected }) => {
      const amount = amountForUtilization(maximum, percent);
      expect(amount).toBe(expected);
      expect(
        Math.abs(utilizationForAmount(maximum, amount) - percent),
      ).toBeLessThanOrEqual(1);
    },
  );

  it("keeps the amount slider useful across small and large positions", () => {
    expect(amountInputStep(0.0488889)).toBe(0.000001);
    expect(amountInputStep(12.03)).toBe(0.01);
    expect(amountInputStep(750)).toBe(1);
    expect(amountInputStep(100_000)).toBe(100);
  });

  it("keeps available provider capacity separate from OWN request potential", () => {
    expect(summarizeEstimatorCapacity([40_000, 75_000, 0], 100_000)).toEqual({
      providerMaximumUsd: 75_000,
      ownPotentialUsd: 100_000,
      maximumRequestableUsd: 100_000,
      providerPathCount: 2,
    });
  });

  it("allows an OWN-sized request when providers have no capacity", () => {
    expect(summarizeEstimatorCapacity([0, Number.NaN], 25_000)).toEqual({
      providerMaximumUsd: 0,
      ownPotentialUsd: 25_000,
      maximumRequestableUsd: 25_000,
      providerPathCount: 0,
    });
  });

  it.each([
    ["request-required", "Request required"],
    ["limited", "Limited availability"],
    ["available-now", "Funding available"],
    ["unavailable", "Unavailable"],
  ] as const)("labels the %s OWN state", (status, expected) => {
    expect(ownFundingStatusLabel(status)).toBe(expected);
  });

  it("requires positive OWN potential that covers the requested amount", () => {
    expect(ownSupportsRequestedAmount(25_000, 10_000)).toBe(true);
    expect(ownSupportsRequestedAmount(5_000, 10_000)).toBe(false);
    expect(ownSupportsRequestedAmount(0, 0)).toBe(false);
  });

  it("sorts assets by descending USD value without mutating registry order", () => {
    const registryOrder = [
      { symbol: "USDC", balance: "10", marketPriceUsd: 1 },
      { symbol: "WETH", balance: "0.5", marketPriceUsd: 3_000 },
      { symbol: "LINK", balance: "20", marketPriceUsd: 12 },
    ];

    expect(
      sortAssetsByUsdValue(registryOrder).map((asset) => asset.symbol),
    ).toEqual(["WETH", "LINK", "USDC"]);
    expect(registryOrder.map((asset) => asset.symbol)).toEqual([
      "USDC",
      "WETH",
      "LINK",
    ]);
  });

  it("formats small positive balances without turning them into zero", () => {
    expect(formatUsdValue(0)).toBe("$0");
    expect(formatUsdValue(0.009)).toBe("$0.0090");
    expect(formatUsdValue(0.0488889)).toBe("$0.0489");
    expect(formatUsdValue(0.93)).toBe("$0.93");
    expect(formatUsdValue(45)).toBe("$45.00");
    expect(formatUsdValue(27_652.42)).toBe("$27,652");
  });

  it("maps technical estimator failures to safe user-facing messages", () => {
    const ensError = {
      data: {
        error: {
          code: "ENS_RESOLUTION_FAILED",
          message: "Raw Call Arguments: resolveWithGateways",
        },
      },
    };
    const providerError = {
      data: {
        error: {
          code: "PROTOCOL_SOURCE_UNAVAILABLE",
          message: "Approved source read failed",
        },
      },
    };

    expect(friendlyEstimatorError(ensError)).toContain(
      "couldn’t resolve that ENS",
    );
    expect(friendlyEstimatorError(ensError)).not.toContain("Raw Call");
    expect(friendlyEstimatorError(providerError)).toContain(
      "temporarily unavailable",
    );
  });
});
