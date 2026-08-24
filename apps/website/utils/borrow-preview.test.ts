import type { ProtocolBorrowQuote } from "@powerrr/shared-types";
import { describe, expect, it } from "vitest";
import {
  calculatePooledBorrowPreview as calculateRawPooledBorrowPreview,
  morphoRouteAssetEvaluations,
  pooledBorrowAvailableUsd,
  pooledRiskDescription,
  pooledRiskTitle,
  pooledRiskTitleForPreview,
  riskBandFromHealthFactor,
} from "./borrow-preview.js";

const quote: ProtocolBorrowQuote = {
  protocolId: "aave-v3",
  protocolLabel: "Aave v3",
  familyId: "aave",
  familyLabel: "Aave",
  chainId: 1,
  mode: "existing-position",
  theoreticalBorrowUsd: 80_000,
  safeBorrowUsd: 60_000,
  existingDebtUsd: 10_000,
  availableLiquidityUsd: 1_000_000,
  targetBorrowAsset: "USDC",
  rateType: "variable",
  indicativeApr: 0.06,
  termMonths: null,
  liquidationRisk: "health-factor",
  collateralUsed: [
    {
      token: "0x0000000000000000000000000000000000000001",
      symbol: "WETH",
      valueUsd: 100_000,
      ltv: 0.8,
      liquidationThreshold: 0.85,
      valueExact: usd(100_000),
      ltvExact: ratio(0.8),
      liquidationThresholdExact: ratio(0.85),
    },
  ],
  capacityBreakdown: exactBreakdown(100_000, 80_000, 60_000, 1_000_000),
  exactMaximum: usd(60_000),
  riskLevel: "low",
  confidence: "high",
  confidenceScore: 95,
  stale: false,
  timestamp: "2026-07-15T00:00:00.000Z",
  assumptions: [],
  warnings: [],
  provenance: [{ source: "test", sourceType: "on-chain" }],
};

function usd(value: number) {
  return { raw: BigInt(Math.round(value * 1_000_000)).toString(), decimals: 6 };
}

function calculatePooledBorrowPreview(
  inputQuote: ProtocolBorrowQuote,
  value: number,
) {
  return calculateRawPooledBorrowPreview(inputQuote, usd(value));
}

function ratio(value: number) {
  return {
    numerator: BigInt(Math.round(value * 1_000_000)).toString(),
    denominator: "1000000",
  };
}

function exactBreakdown(
  collateral: number,
  protocolLimit: number,
  recommended: number,
  liquidity: number,
) {
  return {
    collateralValueUsd: collateral,
    protocolBorrowLimitUsd: protocolLimit,
    safetyAdjustedLimitUsd: recommended,
    liquidityLimitUsd: liquidity,
    recommendedMaxUsd: recommended,
    bindingConstraint: "safety-buffer" as const,
    exact: {
      collateralValue: usd(collateral),
      protocolBorrowLimit: usd(protocolLimit),
      safetyAdjustedLimit: usd(recommended),
      liquidityLimit: usd(liquidity),
      recommendedMaximum: usd(recommended),
    },
  };
}

describe("pooled borrowing risk preview", () => {
  it("uses projected debt and threshold-only liquidation math", () => {
    const result = calculatePooledBorrowPreview(quote, 40_000);

    expect(result.mode).toBe("existing-position");
    expect(result.startingDebtUsd).toBe(10_000);
    expect(result.projectedDebtUsd).toBe(50_000);
    expect(result.projectedLtv).toBe(0.5);
    expect(result.borrowLimitLtv).toBe(0.8);
    expect(result.liquidationThresholdLtv).toBe(0.85);
    expect(result.liquidationSafetyRatio).toBe(1.7);
    expect(result.healthFactor).toBe(1.7);
    expect(result.liquidationHeadroomUsd).toBe(35_000);
    expect(result.modeledLimitUtilization).toBeCloseTo(2 / 3);
    expect(result.riskBand).toBe("wide");
    expect(result.actionable).toBe(true);
    expect(result.reasonCodes).toContain("within-modeled-limit");
    expect(result.status).toBe("below-liquidation-threshold");
  });

  it("does not present protocol debt as included in a new-position estimate", () => {
    const result = calculatePooledBorrowPreview(
      { ...quote, mode: "wallet-estimate", existingDebtUsd: 10_000 },
      40_000,
    );

    expect(result.mode).toBe("wallet-estimate");
    expect(result.startingDebtUsd).toBe(0);
    expect(result.projectedDebtUsd).toBe(40_000);
  });

  it.each(["aave", "sparklend", "morpho-blue", "compound-iii"])(
    "uses one protocol-threshold ratio for %s without inventing a probability",
    (familyId) => {
      const result = calculatePooledBorrowPreview(
        { ...quote, familyId },
        20_000,
      );
      expect(result.liquidationSafetyRatio).toBeCloseTo(0.85 / 0.3);
      expect(result).not.toHaveProperty("liquidationProbability");
      expect(result).not.toHaveProperty("collateralDeclineToLiquidation");
      expect(result).not.toHaveProperty("borrowingPowerUsage");
    },
  );

  it("weights multiple collateral factors and includes existing debt", () => {
    const result = calculatePooledBorrowPreview(
      {
        ...quote,
        existingDebtUsd: 10_000,
        collateralUsed: [
          {
            token: "0x0000000000000000000000000000000000000001",
            symbol: "WETH",
            valueUsd: 100_000,
            ltv: 0.8,
            liquidationThreshold: 0.85,
            valueExact: usd(100_000),
            ltvExact: ratio(0.8),
            liquidationThresholdExact: ratio(0.85),
          },
          {
            token: "0x0000000000000000000000000000000000000002",
            symbol: "WBTC",
            valueUsd: 50_000,
            ltv: 0.7,
            liquidationThreshold: 0.75,
            valueExact: usd(50_000),
            ltvExact: ratio(0.7),
            liquidationThresholdExact: ratio(0.75),
          },
        ],
      },
      40_000,
    );

    expect(result.collateralValueUsd).toBe(150_000);
    expect(result.projectedDebtUsd).toBe(50_000);
    expect(result.projectedLtv).toBeCloseTo(1 / 3);
    expect(result.borrowLimitLtv).toBeCloseTo(115_000 / 150_000);
    expect(result.liquidationThresholdLtv).toBeCloseTo(122_500 / 150_000);
    expect(result.liquidationSafetyRatio).toBe(2.45);
  });

  it("does not show liquidation metrics for an amount above protocol maximum", () => {
    const atThreshold = calculatePooledBorrowPreview(
      { ...quote, existingDebtUsd: 0 },
      85_000,
    );
    const oneCentBelow = calculatePooledBorrowPreview(
      { ...quote, existingDebtUsd: 0 },
      84_999.99,
    );

    expect(atThreshold.liquidationSafetyRatio).toBe(1);
    expect(atThreshold.healthFactor).toBeNull();
    expect(atThreshold.riskBand).toBe("not-executable");
    expect(atThreshold.actionable).toBe(false);
    expect(atThreshold.reasonCodes).toContain("above-modeled-limit");
    expect(atThreshold.reasonCodes).not.toContain("at-liquidation-boundary");
    expect(atThreshold.status).toBe("not-executable");
    expect(pooledRiskTitleForPreview(atThreshold)).toBe(
      "Amount exceeds protocol maximum",
    );
    expect(oneCentBelow.liquidationSafetyRatio).toBeGreaterThan(1);
    expect(oneCentBelow.healthFactor).toBeNull();
    expect(oneCentBelow.status).toBe("not-executable");
  });

  it("keeps Morpho-style LLTV identical in both displayed limit fields", () => {
    const result = calculatePooledBorrowPreview(
      {
        ...quote,
        familyId: "morpho-blue",
        existingDebtUsd: 0,
        collateralUsed: [
          {
            ...quote.collateralUsed[0]!,
            ltv: 0.86,
            liquidationThreshold: 0.86,
          },
        ],
      },
      40_000,
    );

    expect(result.borrowLimitLtv).toBe(0.86);
    expect(result.liquidationThresholdLtv).toBe(0.86);
  });

  it("preserves the Aave target ratio at a sub-dollar maximum", () => {
    const collateralValueUsd = 0.08;
    const liquidationThreshold = 0.825;
    const safeBorrowUsd = (collateralValueUsd * liquidationThreshold) / 1.35;
    const result = calculatePooledBorrowPreview(
      {
        ...quote,
        mode: "wallet-estimate",
        existingDebtUsd: 0,
        safeBorrowUsd,
        collateralUsed: [
          {
            ...quote.collateralUsed[0]!,
            valueUsd: collateralValueUsd,
            ltv: 0.8,
            liquidationThreshold,
          },
        ],
      },
      safeBorrowUsd,
    );

    expect(result.liquidationSafetyRatio).toBeCloseTo(1.35, 5);
    expect(result.riskBand).toBe("reduced");
  });

  it("keeps zero debt neutral and non-actionable", () => {
    const result = calculatePooledBorrowPreview(
      { ...quote, mode: "wallet-estimate", existingDebtUsd: 0 },
      0,
    );

    expect(result.healthFactor).toBeNull();
    expect(result.riskBand).toBe("none");
    expect(result.actionable).toBe(false);
    expect(result.reasonCodes).toEqual(["no-debt-selected"]);
    expect(pooledRiskTitle(result.riskBand)).toBe("No debt selected");
  });

  it.each([
    { healthFactor: 1.6, expected: "wide" },
    { healthFactor: 1.5999, expected: "reduced" },
    { healthFactor: 1.2, expected: "reduced" },
    { healthFactor: 1.1999, expected: "thin" },
    { healthFactor: 1.0001, expected: "thin" },
    { healthFactor: 1, expected: "at-boundary" },
    { healthFactor: 0.9999, expected: "above-threshold" },
  ] as const)(
    "classifies health factor $healthFactor as $expected",
    ({ healthFactor, expected }) => {
      expect(riskBandFromHealthFactor(healthFactor, 1)).toBe(expected);
      expect(pooledRiskTitle(expected)).toBeTruthy();
      expect(pooledRiskDescription(expected)).toBeTruthy();
    },
  );

  it("rejects an amount above the modeled provider limit", () => {
    const result = calculatePooledBorrowPreview(
      { ...quote, mode: "wallet-estimate", existingDebtUsd: 0 },
      60_000.01,
    );

    expect(result.actionable).toBe(false);
    expect(result.healthFactor).toBeNull();
    expect(result.riskBand).toBe("not-executable");
    expect(result.reasonCodes).toContain("above-modeled-limit");
    expect(pooledRiskTitleForPreview(result)).toBe(
      "Amount exceeds protocol maximum",
    );
  });

  it("accepts the exact USDC boundary and rejects one base unit above it", () => {
    const atBoundary = calculatePooledBorrowPreview(
      { ...quote, mode: "wallet-estimate", existingDebtUsd: 0 },
      60_000,
    );
    const oneUnitOver = calculatePooledBorrowPreview(
      { ...quote, mode: "wallet-estimate", existingDebtUsd: 0 },
      60_000.000001,
    );

    expect(atBoundary.actionable).toBe(true);
    expect(oneUnitOver.actionable).toBe(false);
    expect(oneUnitOver.healthFactor).toBeNull();
    expect(oneUnitOver.status).toBe("not-executable");
    expect(oneUnitOver.reasonCodes).toContain("above-modeled-limit");
  });

  it("uses the protocol and liquidity limits instead of a hidden safety recommendation", () => {
    const morphoQuote: ProtocolBorrowQuote = {
      ...quote,
      mode: "wallet-estimate",
      existingDebtUsd: 0,
      theoreticalBorrowUsd: 13_346,
      safeBorrowUsd: 11_344,
      availableLiquidityUsd: 419_618,
      capacityBreakdown: {
        collateralValueUsd: 15_519,
        protocolBorrowLimitUsd: 13_346,
        safetyAdjustedLimitUsd: 11_344,
        liquidityLimitUsd: 419_618,
        recommendedMaxUsd: 11_344,
        bindingConstraint: "safety-buffer",
        exact: exactBreakdown(15_519, 13_346, 11_344, 419_618).exact,
      },
      exactMaximum: usd(13_346),
      collateralUsed: [
        {
          ...quote.collateralUsed[0]!,
          valueUsd: 15_519,
          ltv: 0.86,
          liquidationThreshold: 0.86,
        },
      ],
    };

    expect(pooledBorrowAvailableUsd(morphoQuote)).toBe(13_346);
    expect(calculatePooledBorrowPreview(morphoQuote, 11_639).actionable).toBe(
      true,
    );
  });

  it("rejects a projected Compound debt below the protocol minimum", () => {
    const result = calculatePooledBorrowPreview(
      {
        ...quote,
        familyId: "compound-iii",
        mode: "wallet-estimate",
        existingDebtUsd: 0,
        minimumBorrowUsd: 100,
        capacityBreakdown: {
          ...quote.capacityBreakdown!,
          minimumBorrowUsd: 100,
          exact: {
            ...quote.capacityBreakdown!.exact,
            minimumBorrow: usd(100),
          },
        },
      },
      99.99,
    );

    expect(result.minimumBorrowUsd).toBe(100);
    expect(result.actionable).toBe(false);
    expect(result.healthFactor).toBeNull();
    expect(result.riskBand).toBe("not-executable");
    expect(result.reasonCodes).toContain("below-protocol-minimum");
    expect(pooledRiskTitleForPreview(result)).toBe("Below protocol minimum");
  });

  it("does not mislabel collateral when Compound's maximum is below its minimum", () => {
    const result = calculatePooledBorrowPreview(
      {
        ...quote,
        familyId: "compound-iii",
        mode: "wallet-estimate",
        existingDebtUsd: 0,
        minimumBorrowUsd: 100,
        exactMaximum: usd(0),
        capacityBreakdown: {
          ...exactBreakdown(35, 28.88, 0, 1_000_000),
          minimumBorrowUsd: 100,
          bindingConstraint: "minimum-borrow",
          exact: {
            ...exactBreakdown(35, 28.88, 0, 1_000_000).exact,
            minimumBorrow: usd(100),
          },
        },
      },
      100,
    );

    expect(result.actionable).toBe(false);
    expect(result.reasonCodes).toContain("below-protocol-minimum");
    expect(result.reasonCodes).not.toContain("no-eligible-collateral");
    expect(pooledRiskTitleForPreview(result)).toBe("Below protocol minimum");
  });

  it("does not invent a health factor when no collateral is eligible", () => {
    const result = calculatePooledBorrowPreview(
      {
        ...quote,
        mode: "wallet-estimate",
        existingDebtUsd: 0,
        exactMaximum: usd(0),
        collateralUsed: [],
      },
      1,
    );

    expect(result.actionable).toBe(false);
    expect(result.healthFactor).toBeNull();
    expect(result.riskBand).toBe("not-executable");
    expect(result.reasonCodes).toContain("no-eligible-collateral");
    expect(pooledRiskTitleForPreview(result)).toBe("Not available");
  });

  it("builds a local Morpho route with the maximum common health factor", () => {
    const result = calculatePooledBorrowPreview(
      {
        ...quote,
        protocolId: "morpho-blue",
        familyId: "morpho-blue",
        mode: "wallet-estimate",
        existingDebtUsd: 0,
        exactMaximum: usd(120),
        isolatedMarketCapacities: [
          {
            marketId: "cheap-market",
            collateralToken: "0x0000000000000000000000000000000000000001",
            collateralSymbol: "WETH",
            collateralAvailable: usd(100),
            oraclePrice: { numerator: "1", denominator: "1" },
            lltv: { numerator: "8", denominator: "10" },
            availableLiquidity: usd(80),
            currentBorrowApy: { numerator: "3", denominator: "100" },
          },
          {
            marketId: "other-market",
            collateralToken: "0x0000000000000000000000000000000000000002",
            collateralSymbol: "WBTC",
            collateralAvailable: usd(50),
            oraclePrice: { numerator: "1", denominator: "1" },
            lltv: { numerator: "8", denominator: "10" },
            availableLiquidity: usd(40),
            currentBorrowApy: { numerator: "5", denominator: "100" },
          },
        ],
      },
      40,
    );

    expect(result.actionable).toBe(true);
    expect(result.isolatedRoute?.legs).toHaveLength(2);
    expect(result.isolatedRoute?.weightedCurrentApy).toBeCloseTo(0.0366667, 6);
    expect(result.isolatedRoute?.legs[0]!.healthFactor).toBeCloseTo(
      result.isolatedRoute?.legs[1]!.healthFactor ?? 0,
      6,
    );
    expect(result.isolatedRoute?.worstHealthFactor).toBeCloseTo(3, 6);
    expect(result.healthFactor).toBeCloseTo(3, 6);
  });

  it("shows only source assets assigned to the displayed Morpho route", () => {
    const eth = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as const;
    const weth = "0x0000000000000000000000000000000000000001" as const;
    const weeth = "0x0000000000000000000000000000000000000002" as const;
    const morphoQuote: ProtocolBorrowQuote = {
      ...quote,
      protocolId: "morpho-blue",
      familyId: "morpho-blue",
      assetEvaluations: [
        includedAsset(eth, "ETH", 80),
        includedAsset(weth, "WETH", 20),
        includedAsset(weeth, "WEETH", 10),
      ],
      isolatedMarketCapacities: [
        {
          marketId: "weth-market",
          collateralToken: weth,
          collateralSymbol: "WETH",
          collateralAvailable: usd(100),
          collateralSources: [
            { token: eth, symbol: "ETH", convertedBalance: usd(80) },
            { token: weth, symbol: "WETH", convertedBalance: usd(20) },
          ],
          oraclePrice: { numerator: "1", denominator: "1" },
          lltv: { numerator: "86", denominator: "100" },
          availableLiquidity: usd(1_000),
          currentBorrowApy: { numerator: "4", denominator: "100" },
        },
        {
          marketId: "weeth-market",
          collateralToken: weeth,
          collateralSymbol: "WEETH",
          collateralAvailable: usd(10),
          collateralSources: [
            { token: weeth, symbol: "WEETH", convertedBalance: usd(10) },
          ],
          oraclePrice: { numerator: "1", denominator: "1" },
          lltv: { numerator: "86", denominator: "100" },
          availableLiquidity: usd(1_000),
          currentBorrowApy: { numerator: "4", denominator: "100" },
        },
      ],
    };
    const evaluations = morphoRouteAssetEvaluations(morphoQuote, {
      requestedBorrow: usd(43),
      legs: [
        {
          marketId: "weth-market",
          collateralToken: weth,
          collateralSymbol: "WETH",
          collateralAssigned: usd(50),
          collateralValue: usd(50),
          borrowAmount: usd(43),
          currentBorrowApy: { numerator: "4", denominator: "100" },
          lltv: { numerator: "86", denominator: "100" },
          availableLiquidity: usd(1_000),
          healthFactor: 1,
        },
      ],
      weightedCurrentApy: 0.04,
      effectiveLltv: 0.86,
      lltvMinimum: 0.86,
      lltvMaximum: 0.86,
      worstHealthFactor: 1,
      feasible: true,
    });

    expect(evaluations.map((evaluation) => evaluation.symbol)).toEqual([
      "ETH",
      "WETH",
    ]);
    expect(
      evaluations.reduce(
        (sum, evaluation) => sum + (evaluation.contributionUsd ?? 0),
        0,
      ),
    ).toBe(50);
    expect(
      evaluations.map((evaluation) => ({
        ltv: evaluation.ltv,
        liquidationThreshold: evaluation.liquidationThreshold,
      })),
    ).toEqual([
      { ltv: 0.86, liquidationThreshold: 0.86 },
      { ltv: 0.86, liquidationThreshold: 0.86 },
    ]);
  });
});

function includedAsset(
  token: `0x${string}`,
  symbol: string,
  contributionUsd: number,
) {
  return {
    token,
    symbol,
    balanceUsd: contributionUsd,
    selectionStatus: "selected" as const,
    eligibilityStatus: "included" as const,
    reasonCodes: ["INCLUDED" as const],
    reason: "Included in this market estimate.",
    contributionUsd,
  };
}
