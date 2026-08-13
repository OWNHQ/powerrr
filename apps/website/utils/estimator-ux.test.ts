import { describe, expect, it } from "vitest";
import type {
  PortfolioAsset,
  ProtocolAvailability,
  ProtocolBorrowQuote,
} from "@powerrr/shared-types";
import {
  amountForUtilization,
  amountForTargetLtv,
  amountInputStep,
  filterSmallBalances,
  formatUsdValue,
  friendlyEstimatorError,
  isAssetSelectable,
  providerRateLabel,
  sortAssetsByUsdValue,
  summarizeCollateralCoverage,
  summarizeEstimatorCapacity,
  utilizationForAmount,
} from "./estimator-ux.js";

type CoverageAsset = Pick<
  PortfolioAsset,
  "token" | "balance" | "marketPriceUsd"
>;
type CoverageQuote = Pick<
  ProtocolBorrowQuote,
  "assetEvaluations" | "collateralUsed"
>;

const tokenA = "0x0000000000000000000000000000000000000001" as const;
const tokenB = "0x0000000000000000000000000000000000000002" as const;

function availableStatuses(
  unavailableCount = 0,
): Pick<ProtocolAvailability, "status">[] {
  return [
    { status: "available" },
    ...Array.from({ length: unavailableCount }, () => ({
      status: "unavailable" as const,
    })),
  ];
}

function selectedEvaluationQuote(
  token: typeof tokenA | typeof tokenB,
  contributionUsd: number,
): CoverageQuote {
  return {
    collateralUsed: [],
    assetEvaluations: [
      {
        token,
        symbol: token === tokenA ? "AAA" : "BBB",
        selectionStatus: "selected",
        eligibilityStatus: "included",
        reasonCodes: ["INCLUDED"],
        reason: "Included in this estimate.",
        contributionUsd,
      },
    ],
  };
}

describe("estimator UX helpers", () => {
  it("only allows assets with a verified positive price to be selected", () => {
    expect(
      isAssetSelectable({
        marketPriceUsd: 2_000,
        priceStatus: "available",
        valuationStatus: "available",
      }),
    ).toBe(true);
    expect(
      isAssetSelectable({
        marketPriceUsd: undefined,
        priceStatus: "unavailable",
        valuationStatus: "manual-review",
      }),
    ).toBe(false);
    expect(
      isAssetSelectable({
        marketPriceUsd: 2_000,
        priceStatus: "unavailable",
        valuationStatus: "available",
      }),
    ).toBe(false);
  });

  it.each([
    {
      convention: "apr" as const,
      value: 0.05,
      expected: "5.00% variable APR",
    },
    {
      convention: "apy" as const,
      value: 0.05127,
      expected: "5.13% variable APY",
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
    ).toBe("6.50% fixed APR");
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

  it("calculates a borrow amount for a projected LTV scenario", () => {
    expect(amountForTargetLtv(6_000, 0, 50)).toBe(3_000);
    expect(amountForTargetLtv(100_000, 10_000, 50)).toBe(40_000);
    expect(amountForTargetLtv(10_000, 7_000, 50)).toBe(0);
  });

  it("summarizes available provider capacity", () => {
    expect(summarizeEstimatorCapacity([40_000, 75_000, 0])).toEqual({
      providerMaximumUsd: 75_000,
      providerPathCount: 2,
    });
  });

  it("returns zero capacity when providers have no capacity", () => {
    expect(summarizeEstimatorCapacity([0, Number.NaN])).toEqual({
      providerMaximumUsd: 0,
      providerPathCount: 0,
    });
  });

  it("reports complete coverage and does not double-count a token modeled by multiple paths", () => {
    const assets: CoverageAsset[] = [
      { token: tokenA, balance: "2", marketPriceUsd: 100 },
    ];
    const quote = selectedEvaluationQuote(tokenA, 200);

    expect(
      summarizeCollateralCoverage(assets, [quote, quote], availableStatuses()),
    ).toEqual({
      selectedValueUsd: 200,
      modeledValueUsd: 200,
      gapValueUsd: 0,
      sourceStatus: "complete",
    });
  });

  it("rounds sub-cent coverage dust to zero", () => {
    const assets: CoverageAsset[] = [
      { token: tokenA, balance: "100.000001", marketPriceUsd: 1 },
    ];

    expect(
      summarizeCollateralCoverage(
        assets,
        [selectedEvaluationQuote(tokenA, 100)],
        availableStatuses(),
      ),
    ).toMatchObject({ modeledValueUsd: 100, gapValueUsd: 0 });
  });

  it("reports selected value that is not modeled by any pooled path", () => {
    const assets: CoverageAsset[] = [
      { token: tokenA, balance: "2", marketPriceUsd: 100 },
      { token: tokenB, balance: "3", marketPriceUsd: 50 },
    ];

    expect(
      summarizeCollateralCoverage(
        assets,
        [selectedEvaluationQuote(tokenA, 200)],
        availableStatuses(),
      ),
    ).toEqual({
      selectedValueUsd: 350,
      modeledValueUsd: 200,
      gapValueUsd: 150,
      sourceStatus: "complete",
    });
  });

  it("uses the largest actual per-token contribution without double-counting paths", () => {
    const assets: CoverageAsset[] = [
      { token: tokenA, balance: "100", marketPriceUsd: 100 },
    ];
    expect(
      summarizeCollateralCoverage(
        assets,
        [
          selectedEvaluationQuote(tokenA, 1_000),
          selectedEvaluationQuote(tokenA, 2_500),
          selectedEvaluationQuote(tokenA, 2_000),
        ],
        availableStatuses(),
      ),
    ).toEqual({
      selectedValueUsd: 10_000,
      modeledValueUsd: 2_500,
      gapValueUsd: 7_500,
      sourceStatus: "complete",
    });
  });

  it("uses a selected converted asset evaluation with a positive contribution", () => {
    const assets: CoverageAsset[] = [
      { token: tokenA, balance: "1", marketPriceUsd: 2_000 },
    ];
    const quote = selectedEvaluationQuote(tokenA, 1_950);
    quote.assetEvaluations![0]!.selectionStatus = "unselectable";
    quote.assetEvaluations![0]!.eligibilityStatus = "supported";
    quote.assetEvaluations![0]!.reasonCodes = ["CONVERSION_REQUIRED"];

    expect(
      summarizeCollateralCoverage(assets, [quote], availableStatuses()),
    ).toMatchObject({ modeledValueUsd: 1_950, gapValueUsd: 50 });
  });

  it("falls back to collateral used when asset evaluations are absent", () => {
    const assets: CoverageAsset[] = [
      { token: tokenA, balance: "4", marketPriceUsd: 25 },
    ];
    const quote: CoverageQuote = {
      collateralUsed: [
        {
          token: tokenA,
          symbol: "AAA",
          valueUsd: 100,
          valueExact: { raw: "100000000", decimals: 6 },
          ltvExact: { numerator: "0", denominator: "1" },
          liquidationThresholdExact: { numerator: "0", denominator: "1" },
        },
      ],
    };

    expect(
      summarizeCollateralCoverage(assets, [quote], availableStatuses()),
    ).toMatchObject({ modeledValueUsd: 100, gapValueUsd: 0 });
  });

  it("marks partial and total provider failures without overstating the gap", () => {
    const assets: CoverageAsset[] = [
      { token: tokenA, balance: "2", marketPriceUsd: 100 },
    ];
    const quote = selectedEvaluationQuote(tokenA, 200);

    expect(
      summarizeCollateralCoverage(assets, [quote], availableStatuses(1)),
    ).toMatchObject({ sourceStatus: "partial", gapValueUsd: 0 });
    expect(
      summarizeCollateralCoverage(assets, [], [{ status: "unavailable" }]),
    ).toEqual({
      selectedValueUsd: 200,
      modeledValueUsd: null,
      gapValueUsd: null,
      sourceStatus: "unavailable",
    });
  });

  it("excludes invalid, missing, zero, and negative valuations", () => {
    const assets: CoverageAsset[] = [
      { token: tokenA, balance: "not-a-number", marketPriceUsd: 100 },
      { token: tokenB, balance: "10", marketPriceUsd: undefined },
      { token: tokenA, balance: "0", marketPriceUsd: 100 },
      { token: tokenB, balance: "5", marketPriceUsd: -10 },
    ];

    expect(
      summarizeCollateralCoverage(
        assets,
        [{ collateralUsed: [] }],
        availableStatuses(),
      ),
    ).toEqual({
      selectedValueUsd: 0,
      modeledValueUsd: 0,
      gapValueUsd: 0,
      sourceStatus: "complete",
    });
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

  it("hides balances below $5 when the account has a larger balance", () => {
    const assets = [
      { symbol: "USDC", balance: "4.99", marketPriceUsd: 1 },
      { symbol: "DAI", balance: "5", marketPriceUsd: 1 },
      { symbol: "WETH", balance: "0.01", marketPriceUsd: 3_000 },
    ];

    expect(filterSmallBalances(assets).map((asset) => asset.symbol)).toEqual([
      "DAI",
      "WETH",
    ]);
  });

  it("shows every positive balance when the $5 filter would empty the account", () => {
    const smallAccount = [
      { symbol: "USDC", balance: "4", marketPriceUsd: 1 },
      { symbol: "DAI", balance: "3", marketPriceUsd: 1 },
      { symbol: "USDT", balance: "3", marketPriceUsd: 1 },
    ];

    expect(
      filterSmallBalances(smallAccount).map((asset) => asset.symbol),
    ).toEqual(["USDC", "DAI", "USDT"]);
  });

  it("formats every dollar amount to two decimal places", () => {
    expect(formatUsdValue(0)).toBe("$0.00");
    expect(formatUsdValue(0.009)).toBe("$0.01");
    expect(formatUsdValue(0.0488889)).toBe("$0.05");
    expect(formatUsdValue(0.93)).toBe("$0.93");
    expect(formatUsdValue(45)).toBe("$45.00");
    expect(formatUsdValue(27_652.42)).toBe("$27,652.42");
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
