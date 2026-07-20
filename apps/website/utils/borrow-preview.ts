import type { ProtocolBorrowQuote } from "@powerrr/shared-types";

export type PooledBorrowPreview = {
  projectedDebtUsd: number;
  collateralValueUsd: number;
  ltv: number;
  healthMetric: number;
  healthMetricLabel: "Health factor" | "Liquidation ratio";
  borrowingPowerUsage: number;
  collateralDeclineToLiquidation: number;
  annualInterestUsd: number;
  status: "comfortable" | "watch" | "liquidation-risk";
};

export function calculatePooledBorrowPreview(
  quote: ProtocolBorrowQuote,
  borrowAmountUsd: number,
): PooledBorrowPreview {
  const collateralValueUsd = quote.collateralUsed.reduce(
    (sum, item) => sum + item.valueUsd,
    0,
  );
  const borrowCapacityUsd = quote.collateralUsed.reduce(
    (sum, item) => sum + item.valueUsd * (item.ltv ?? 0),
    0,
  );
  const liquidationCapacityUsd = quote.collateralUsed.reduce(
    (sum, item) =>
      sum + item.valueUsd * (item.liquidationThreshold ?? item.ltv ?? 0),
    0,
  );
  const projectedDebtUsd = Math.max(
    0,
    (quote.existingDebtUsd ?? 0) + borrowAmountUsd,
  );
  const ltv = ratio(projectedDebtUsd, collateralValueUsd);
  const healthMetric =
    projectedDebtUsd <= 0
      ? Number.POSITIVE_INFINITY
      : liquidationCapacityUsd / projectedDebtUsd;
  const borrowingPowerUsage = ratio(projectedDebtUsd, borrowCapacityUsd);
  const collateralDeclineToLiquidation =
    liquidationCapacityUsd <= 0
      ? 0
      : clamp(1 - projectedDebtUsd / liquidationCapacityUsd, 0, 1);
  const status =
    healthMetric > 1.8
      ? "comfortable"
      : healthMetric >= 1.3
        ? "watch"
        : "liquidation-risk";

  return {
    projectedDebtUsd: roundUsd(projectedDebtUsd),
    collateralValueUsd: roundUsd(collateralValueUsd),
    ltv,
    healthMetric,
    healthMetricLabel:
      quote.familyId === "compound-iii" ? "Liquidation ratio" : "Health factor",
    borrowingPowerUsage,
    collateralDeclineToLiquidation,
    annualInterestUsd: roundUsd(
      borrowAmountUsd * (quote.annualRate?.value ?? quote.indicativeApr ?? 0),
    ),
    status,
  };
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}
