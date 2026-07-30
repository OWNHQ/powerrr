import type { ProtocolBorrowQuote } from "@powerrr/shared-types";
import { describe, expect, it } from "vitest";
import {
  calculatePooledBorrowPreview,
  pooledBorrowAvailableUsd,
  pooledRiskDescription,
  pooledRiskTitle,
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
    },
  ],
  riskLevel: "low",
  confidence: "high",
  confidenceScore: 95,
  stale: false,
  timestamp: "2026-07-15T00:00:00.000Z",
  assumptions: [],
  warnings: [],
  provenance: [{ source: "test", sourceType: "on-chain" }],
};

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
          },
          {
            token: "0x0000000000000000000000000000000000000002",
            symbol: "WBTC",
            valueUsd: 50_000,
            ltv: 0.7,
            liquidationThreshold: 0.75,
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

  it("treats the exact liquidation boundary as at threshold", () => {
    const atThreshold = calculatePooledBorrowPreview(
      { ...quote, existingDebtUsd: 0 },
      85_000,
    );
    const oneCentBelow = calculatePooledBorrowPreview(
      { ...quote, existingDebtUsd: 0 },
      84_999.99,
    );

    expect(atThreshold.liquidationSafetyRatio).toBe(1);
    expect(atThreshold.riskBand).toBe("at-boundary");
    expect(atThreshold.actionable).toBe(false);
    expect(atThreshold.reasonCodes).toContain("above-modeled-limit");
    expect(atThreshold.reasonCodes).toContain("at-liquidation-boundary");
    expect(atThreshold.status).toBe("at-or-above-liquidation-threshold");
    expect(oneCentBelow.liquidationSafetyRatio).toBeGreaterThan(1);
    expect(oneCentBelow.status).toBe("below-liquidation-threshold");
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

    expect(result.liquidationSafetyRatio).toBeCloseTo(1.35, 10);
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
    expect(result.reasonCodes).toContain("above-modeled-limit");
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
      },
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
      },
      99.99,
    );

    expect(result.minimumBorrowUsd).toBe(100);
    expect(result.actionable).toBe(false);
    expect(result.reasonCodes).toContain("below-protocol-minimum");
  });
});
