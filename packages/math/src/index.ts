import type { Confidence, RiskLevel } from "@powerrr/shared-types";

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
