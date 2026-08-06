import type { Confidence, RiskLevel } from "@powerrr/shared-types";
import type { RawAmount, RawRatio } from "@powerrr/shared-types";

export const USDC_DECIMALS = 6;

export function pow10(decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error(`Invalid decimal scale ${decimals}`);
  }
  return 10n ** BigInt(decimals);
}

export function mulDivDown(
  multiplicand: bigint,
  multiplier: bigint,
  denominator: bigint,
): bigint {
  if (multiplicand < 0n || multiplier < 0n || denominator <= 0n) {
    throw new Error(
      "mulDivDown expects non-negative values and a positive denominator",
    );
  }
  return (multiplicand * multiplier) / denominator;
}

export function mulDivUp(
  multiplicand: bigint,
  multiplier: bigint,
  denominator: bigint,
): bigint {
  if (multiplicand < 0n || multiplier < 0n || denominator <= 0n) {
    throw new Error(
      "mulDivUp expects non-negative values and a positive denominator",
    );
  }
  const product = multiplicand * multiplier;
  return product === 0n ? 0n : (product - 1n) / denominator + 1n;
}

export function minBigInt(...values: bigint[]): bigint {
  if (!values.length) return 0n;
  return values.reduce((minimum, value) => (value < minimum ? value : minimum));
}

export function rawAmount(raw: bigint, decimals: number): RawAmount {
  return { raw: (raw < 0n ? 0n : raw).toString(), decimals };
}

export function rawRatio(numerator: bigint, denominator: bigint): RawRatio {
  if (denominator <= 0n)
    throw new Error("Raw ratio denominator must be positive");
  return {
    numerator: numerator.toString(),
    denominator: denominator.toString(),
  };
}

export function scaleRawAmount(
  value: bigint,
  fromDecimals: number,
  toDecimals: number,
): bigint {
  if (fromDecimals === toDecimals) return value;
  return fromDecimals < toDecimals
    ? value * pow10(toDecimals - fromDecimals)
    : value / pow10(fromDecimals - toDecimals);
}

export function compareRawAmounts(left: RawAmount, right: RawAmount): number {
  const decimals = Math.max(left.decimals, right.decimals);
  const leftRaw = scaleRawAmount(BigInt(left.raw), left.decimals, decimals);
  const rightRaw = scaleRawAmount(BigInt(right.raw), right.decimals, decimals);
  return leftRaw < rightRaw ? -1 : leftRaw > rightRaw ? 1 : 0;
}

export function rawAmountToNumber(value: RawAmount): number {
  const raw = BigInt(value.raw);
  const scale = pow10(value.decimals);
  const whole = raw / scale;
  const fraction = raw % scale;
  return Number(whole) + Number(fraction) / Number(scale);
}

export function decimalStringToRaw(value: string, decimals: number): bigint {
  const normalized = value.trim().replaceAll(",", "").replace(/^\$/, "");
  if (!/^\d*(?:\.\d*)?$/.test(normalized) || normalized === "") return 0n;
  const [whole = "0", fraction = ""] = normalized.split(".");
  const padded = `${fraction}${"0".repeat(decimals)}`.slice(0, decimals);
  return BigInt(whole || "0") * pow10(decimals) + BigInt(padded || "0");
}

export type AaveLikeCollateralInput = {
  valueUsd: number;
  ltv: number;
  liquidationThreshold: number;
};

export type AaveLikeBorrowInput = {
  collateral: AaveLikeCollateralInput[];
  existingDebtUsd: number;
  availableLiquidityUsd: number;
  targetHealthFactor: number;
  safetyBuffer: number;
};

export type BorrowCapacityResult = {
  theoreticalBorrowUsd: number;
  safeBorrowUsd: number;
  weightedLiquidationValueUsd: number;
  healthFactor: number | null;
};

export type MorphoMarketInput = {
  collateralValueUsd: number;
  lltv: number;
  borrowedUsd: number;
  availableLiquidityUsd: number;
  safetyBuffer: number;
};

export type CompoundInput = {
  collateral: Array<{
    valueUsd: number;
    borrowCollateralFactor: number;
    liquidateCollateralFactor: number;
  }>;
  existingDebtUsd: number;
  availableBaseLiquidityUsd: number;
  safetyBuffer: number;
};

export function roundUsd(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value !== 0 && Math.abs(value) < 1) {
    return Number(value.toPrecision(6));
  }
  return Math.round(value * 100) / 100;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function safetyBufferForProfile(
  profile: "max" | "balanced" | "conservative",
): number {
  if (profile === "max") return 1;
  if (profile === "conservative") return 0.72;
  return 0.85;
}

export function calculateAaveLikeBorrow(
  input: AaveLikeBorrowInput,
): BorrowCapacityResult {
  const theoreticalGross = input.collateral.reduce(
    (sum, item) => sum + item.valueUsd * item.ltv,
    0,
  );
  const weightedLiquidationValueUsd = input.collateral.reduce(
    (sum, item) => sum + item.valueUsd * item.liquidationThreshold,
    0,
  );
  const theoreticalBorrowUsd = Math.max(
    0,
    theoreticalGross - input.existingDebtUsd,
  );
  const safeHeadroomByHealthFactor = Math.max(
    0,
    weightedLiquidationValueUsd / input.targetHealthFactor -
      input.existingDebtUsd,
  );
  const safeBorrowUsd = Math.min(
    theoreticalBorrowUsd * input.safetyBuffer,
    safeHeadroomByHealthFactor,
    input.availableLiquidityUsd,
  );
  const healthFactor =
    input.existingDebtUsd > 0
      ? weightedLiquidationValueUsd / input.existingDebtUsd
      : null;

  return {
    theoreticalBorrowUsd: roundUsd(theoreticalBorrowUsd),
    safeBorrowUsd: roundUsd(safeBorrowUsd),
    weightedLiquidationValueUsd: roundUsd(weightedLiquidationValueUsd),
    healthFactor: healthFactor === null ? null : roundRatio(healthFactor),
  };
}

export function calculateMorphoMarket(
  input: MorphoMarketInput,
): BorrowCapacityResult {
  const theoreticalGross = input.collateralValueUsd * input.lltv;
  const theoreticalBorrowUsd = Math.max(
    0,
    theoreticalGross - input.borrowedUsd,
  );
  const safeBorrowUsd = Math.min(
    theoreticalBorrowUsd * input.safetyBuffer,
    input.availableLiquidityUsd,
  );
  const healthFactor =
    input.borrowedUsd > 0
      ? (input.collateralValueUsd * input.lltv) / input.borrowedUsd
      : null;

  return {
    theoreticalBorrowUsd: roundUsd(theoreticalBorrowUsd),
    safeBorrowUsd: roundUsd(safeBorrowUsd),
    weightedLiquidationValueUsd: roundUsd(
      input.collateralValueUsd * input.lltv,
    ),
    healthFactor: healthFactor === null ? null : roundRatio(healthFactor),
  };
}

export function calculateCompoundBorrow(
  input: CompoundInput,
): BorrowCapacityResult {
  const theoreticalGross = input.collateral.reduce(
    (sum, item) => sum + item.valueUsd * item.borrowCollateralFactor,
    0,
  );
  const liquidationCapacity = input.collateral.reduce(
    (sum, item) => sum + item.valueUsd * item.liquidateCollateralFactor,
    0,
  );
  const theoreticalBorrowUsd = Math.max(
    0,
    theoreticalGross - input.existingDebtUsd,
  );
  const safeBorrowUsd = Math.min(
    theoreticalBorrowUsd * input.safetyBuffer,
    input.availableBaseLiquidityUsd,
  );
  const healthFactor =
    input.existingDebtUsd > 0
      ? liquidationCapacity / input.existingDebtUsd
      : null;

  return {
    theoreticalBorrowUsd: roundUsd(theoreticalBorrowUsd),
    safeBorrowUsd: roundUsd(safeBorrowUsd),
    weightedLiquidationValueUsd: roundUsd(liquidationCapacity),
    healthFactor: healthFactor === null ? null : roundRatio(healthFactor),
  };
}

export function calculateConfidenceScore(input: {
  sourcePenalty: number;
  stalenessPenalty: number;
  fallbackPenalty: number;
  complexityPenalty: number;
  liquidityPenalty: number;
}): { score: number; confidence: Confidence } {
  const score = clamp(
    100 -
      input.sourcePenalty -
      input.stalenessPenalty -
      input.fallbackPenalty -
      input.complexityPenalty -
      input.liquidityPenalty,
    0,
    100,
  );
  return { score, confidence: confidenceFromScore(score) };
}

export function confidenceFromScore(score: number): Confidence {
  if (score >= 85) return "high";
  if (score >= 65) return "medium";
  return "low";
}

export function riskLevelFromHealthFactor(
  healthFactor: number | null,
): RiskLevel {
  if (healthFactor === null) return "unknown";
  if (healthFactor >= 1.6) return "low";
  if (healthFactor >= 1.2) return "medium";
  return "high";
}

function roundRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10_000) / 10_000;
}
