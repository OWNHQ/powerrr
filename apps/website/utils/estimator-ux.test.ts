import { describe, expect, it } from "vitest";
import {
  amountForUtilization,
  amountInputStep,
  chooseDefaultProviderId,
  formatUsdValue,
  friendlyEstimatorError,
  providerAvailabilityMessage,
  sortAssetsByUsdValue,
  utilizationForAmount,
} from "./estimator-ux.js";

describe("estimator UX helpers", () => {
  it("prefers actionable OWN and otherwise selects the highest-capacity live provider", () => {
    const providers = [
      { id: "aave", capacityUsd: 20_000 },
      { id: "compound", capacityUsd: 80_000 },
    ];

    expect(
      chooseDefaultProviderId({
        ownPotentialUsd: 100_000,
        ownLeadEnabled: true,
        providers,
      }),
    ).toBe("own");
    expect(
      chooseDefaultProviderId({
        ownPotentialUsd: 100_000,
        ownLeadEnabled: false,
        providers,
      }),
    ).toBe("compound");
    expect(
      chooseDefaultProviderId({
        ownPotentialUsd: 0,
        ownLeadEnabled: true,
        providers: providers.map((provider) => ({
          ...provider,
          capacityUsd: 0,
        })),
      }),
    ).toBe("");
  });

  it.each([
    { maximum: 0.93, percent: 50, expected: 0.47, step: 0.01 },
    { maximum: 75, percent: 50, expected: 37.5, step: 0.01 },
    { maximum: 900, percent: 25, expected: 225, step: 1 },
    { maximum: 100_000, percent: 75, expected: 75_000, step: 100 },
  ])(
    "keeps amount and utilization accurate for a $maximum maximum",
    ({ maximum, percent, expected, step }) => {
      const amount = amountForUtilization(maximum, percent);
      expect(amount).toBe(expected);
      expect(
        Math.abs(utilizationForAmount(maximum, amount) - percent),
      ).toBeLessThanOrEqual(1);
      expect(amountInputStep(maximum)).toBe(step);
    },
  );

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
    expect(formatUsdValue(0.009)).toBe("<$0.01");
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
    expect(providerAvailabilityMessage("Approved source read failed")).toBe(
      "Live estimate temporarily unavailable",
    );
  });
});
