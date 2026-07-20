import { describe, expect, it } from "vitest";
import {
  amortizingMonthlyPayment,
  calculateAaveLikeBorrow,
  calculateCompoundBorrow,
  calculateMorphoMarket,
  calculateOwnOfferedPrincipal,
  outstandingBalanceAfterPayments,
  riskLevelFromHealthFactor,
  roundUsd,
  runScenarioStress,
} from "./index.js";

describe("financial math", () => {
  it("never rounds a positive USD value down to zero", () => {
    expect(roundUsd(0.000422)).toBe(0.000422);
    expect(roundUsd(0.00499999)).toBe(0.00499999);
    expect(roundUsd(0.005)).toBe(0.01);
  });

  it("calculates Aave/Spark-style theoretical and safe borrow capacity", () => {
    const result = calculateAaveLikeBorrow({
      collateral: [
        { valueUsd: 100_000, ltv: 0.8, liquidationThreshold: 0.85 },
        { valueUsd: 50_000, ltv: 0.7, liquidationThreshold: 0.75 },
      ],
      existingDebtUsd: 10_000,
      availableLiquidityUsd: 500_000,
      targetHealthFactor: 1.35,
      safetyBuffer: 0.85,
    });

    expect(result.theoreticalBorrowUsd).toBe(105_000);
    expect(result.safeBorrowUsd).toBe(80_740.74);
    expect(result.healthFactor).toBe(12.25);
  });

  it("calculates Morpho LLTV capacity at isolated-market grain", () => {
    const result = calculateMorphoMarket({
      collateralValueUsd: 100_000,
      lltv: 0.86,
      borrowedUsd: 20_000,
      availableLiquidityUsd: 50_000,
      safetyBuffer: 0.85,
    });

    expect(result.theoreticalBorrowUsd).toBe(66_000);
    expect(result.safeBorrowUsd).toBe(50_000);
    expect(result.healthFactor).toBe(4.3);
  });

  it("calculates Compound III borrow and liquidation factors separately", () => {
    const result = calculateCompoundBorrow({
      collateral: [
        {
          valueUsd: 100_000,
          borrowCollateralFactor: 0.825,
          liquidateCollateralFactor: 0.9,
        },
      ],
      existingDebtUsd: 25_000,
      availableBaseLiquidityUsd: 100_000,
      safetyBuffer: 0.85,
    });

    expect(result.theoreticalBorrowUsd).toBe(57_500);
    expect(result.safeBorrowUsd).toBe(48_875);
    expect(result.healthFactor).toBe(3.6);
  });

  it("treats an unavailable health factor as unknown rather than safe", () => {
    expect(riskLevelFromHealthFactor(null)).toBe("unknown");
  });

  it("models OWN ticket caps and amortization", () => {
    const own = calculateOwnOfferedPrincipal(
      [
        {
          valueUsd: 1_000_000,
          maxAdvanceRate: 0.52,
          haircut: 0.96,
          family: "ETH",
        },
        {
          valueUsd: 500_000,
          maxAdvanceRate: 0.72,
          haircut: 0.98,
          family: "USD",
        },
      ],
      {
        capitalAvailabilityUsd: 2_500_000,
        maxTicketUsd: 750_000,
        targetConcentrationLimitUsd: 500_000,
      },
    );

    expect(own.offeredPrincipalUsd).toBe(499_200);

    const payment = amortizingMonthlyPayment(100_000, 0.095, 24);
    const endingBalance = outstandingBalanceAfterPayments(
      100_000,
      0.095,
      24,
      24,
    );

    expect(payment).toBeGreaterThan(4_500);
    expect(endingBalance).toBe(0);
  });

  it("does not let adverse scenario stress improve safe borrow", () => {
    const result = runScenarioStress(
      {
        protocolId: "own",
        protocolLabel: "OWN",
        familyId: "own",
        familyLabel: "OWN",
        chainId: 1,
        mode: "wallet-estimate",
        theoreticalBorrowUsd: 60_000,
        safeBorrowUsd: 38_000,
        existingDebtUsd: 0,
        availableLiquidityUsd: 2_500_000,
        targetBorrowAsset: "USD",
        rateType: "fixed",
        indicativeApr: 0.095,
        termMonths: 24,
        liquidationRisk: "none-assumed-own",
        collateralUsed: [
          {
            token: "0x0000000000000000000000000000000000000001",
            symbol: "WETH",
            valueUsd: 100_000,
            ltv: 0.52,
            liquidationThreshold: 0.62,
          },
        ],
        healthFactor: null,
        riskLevel: "medium",
        confidence: "medium",
        confidenceScore: 80,
        stale: false,
        timestamp: "2026-07-01T00:00:00.000Z",
        assumptions: [],
        warnings: [],
        provenance: [],
      },
      {
        id: "combined-crash",
        label: "Combined crash",
        description: "Adverse deterministic stress.",
        collateralShock: { WETH: 0.38, default: 0.12 },
        liquidityMultiplier: 0.35,
        aprShockBps: 650,
        confidencePenalty: 18,
      },
    );

    expect(result.stressedSafeBorrowUsd).toBeLessThanOrEqual(
      result.baseSafeBorrowUsd ?? 0,
    );
  });

  it("applies protocol-specific safe-borrow stress for OWN delinquency lag", () => {
    const result = runScenarioStress(
      {
        protocolId: "own",
        protocolLabel: "OWN",
        familyId: "own",
        familyLabel: "OWN",
        chainId: 1,
        mode: "wallet-estimate",
        theoreticalBorrowUsd: 120_000,
        safeBorrowUsd: 50_000,
        existingDebtUsd: 0,
        availableLiquidityUsd: 2_500_000,
        targetBorrowAsset: "USD",
        rateType: "fixed",
        indicativeApr: 0.095,
        termMonths: 24,
        liquidationRisk: "none-assumed-own",
        collateralUsed: [
          {
            token: "0x0000000000000000000000000000000000000001",
            symbol: "WETH",
            valueUsd: 300_000,
            ltv: 0.52,
            liquidationThreshold: 0.62,
          },
        ],
        healthFactor: null,
        riskLevel: "medium",
        confidence: "medium",
        confidenceScore: 80,
        stale: false,
        timestamp: "2026-07-01T00:00:00.000Z",
        assumptions: [],
        warnings: [],
        provenance: [],
      },
      {
        id: "own-delinquency-lag",
        label: "OWN delinquency lag",
        description: "Delayed recovery path for fixed-term loans.",
        collateralShock: { default: 0.14 },
        liquidityMultiplier: 1,
        aprShockBps: 0,
        confidencePenalty: 9,
        protocolSafeBorrowMultiplier: {
          own: 0.78,
        },
      },
    );

    expect(result.stressedSafeBorrowUsd).toBe(39_000);
  });
});
