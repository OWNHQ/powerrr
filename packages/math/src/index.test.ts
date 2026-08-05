import { describe, expect, it } from "vitest";
import {
  calculateAaveLikeBorrow,
  calculateCompoundBorrow,
  calculateMorphoMarket,
  compareRawAmounts,
  decimalStringToRaw,
  mulDivDown,
  riskLevelFromHealthFactor,
  roundUsd,
} from "./index.js";

describe("borrow-capacity math", () => {
  it("keeps 256-bit monetary arithmetic exact and rounds only downward", () => {
    const maximumUint256 = (1n << 256n) - 1n;
    expect(mulDivDown(maximumUint256, 999_999n, 1_000_000n)).toBe(
      (maximumUint256 * 999_999n) / 1_000_000n,
    );
    expect(mulDivDown(1n, 1n, 3n)).toBe(0n);
    expect(decimalStringToRaw("0.0000019", 6)).toBe(1n);
  });

  it("compares exact amounts across decimal scales", () => {
    expect(
      compareRawAmounts(
        { raw: "1000000", decimals: 6 },
        { raw: "1000000000000000000", decimals: 18 },
      ),
    ).toBe(0);
    expect(
      compareRawAmounts(
        { raw: "1000001", decimals: 6 },
        { raw: "1000000000000000000", decimals: 18 },
      ),
    ).toBe(1);
  });

  it("never rounds a positive sub-dollar value down to zero", () => {
    expect(roundUsd(0.000422)).toBe(0.000422);
    expect(roundUsd(0.00499999)).toBe(0.00499999);
  });

  it("calculates Aave and Spark capacity", () => {
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

  it("calculates Morpho isolated-market capacity", () => {
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

  it("calculates Compound borrow and liquidation factors separately", () => {
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

  it("treats an unavailable health factor as unknown", () => {
    expect(riskLevelFromHealthFactor(null)).toBe("unknown");
  });
});
