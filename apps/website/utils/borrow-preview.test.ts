import type { ProtocolBorrowQuote } from "@powerrr/shared-types";
import { describe, expect, it } from "vitest";
import { calculatePooledBorrowPreview } from "./borrow-preview.js";

const quote: ProtocolBorrowQuote = {
  protocolId: "aave-v3",
  protocolLabel: "Aave v3",
  familyId: "aave",
  familyLabel: "Aave",
  chainId: 1,
  mode: "wallet-estimate",
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

    expect(result.projectedDebtUsd).toBe(50_000);
    expect(result.ltv).toBe(0.5);
    expect(result.healthMetric).toBe(1.7);
    expect(result.borrowingPowerUsage).toBe(0.625);
    expect(result.collateralDeclineToLiquidation).toBeCloseTo(0.4118, 4);
    expect(result.annualInterestUsd).toBe(2_400);
    expect(result.status).toBe("watch");
  });

  it("uses the additive annual-rate contract when legacy APR is absent", () => {
    const result = calculatePooledBorrowPreview(
      {
        ...quote,
        indicativeApr: null,
        annualRate: {
          value: 0.052,
          convention: "apy",
          rateType: "variable",
          sourceId: "morpho-blue:market-1",
        },
      },
      40_000,
    );

    expect(result.annualInterestUsd).toBe(2_080);
  });

  it("labels Compound's threshold metric without inventing a probability", () => {
    const result = calculatePooledBorrowPreview(
      { ...quote, familyId: "compound-iii" },
      20_000,
    );
    expect(result.healthMetricLabel).toBe("Liquidation ratio");
    expect(result).not.toHaveProperty("liquidationProbability");
  });
});
