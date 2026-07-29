import type { ProtocolBorrowQuote } from "@powerrr/shared-types";

export type PooledBorrowPreview = {
  mode: ProtocolBorrowQuote["mode"];
  startingDebtUsd: number;
  projectedDebtUsd: number;
  collateralValueUsd: number;
  projectedLtv: number;
  borrowLimitLtv: number;
  liquidationThresholdLtv: number;
  liquidationSafetyRatio: number;
  healthFactor: number | null;
  liquidationHeadroomUsd: number;
  recommendedLimitUtilization: number;
  minimumBorrowUsd: number;
  riskBand: PooledRiskBand;
  actionable: boolean;
  reasonCodes: PooledPreviewReasonCode[];
  status: "below-liquidation-threshold" | "at-or-above-liquidation-threshold";
};

export type PooledRiskBand =
  "none" | "wide" | "reduced" | "thin" | "at-boundary" | "above-threshold";

export type PooledPreviewReasonCode =
  | "no-debt-selected"
  | "below-protocol-minimum"
  | "within-recommended-limit"
  | "above-recommended-limit"
  | "at-liquidation-boundary"
  | "above-liquidation-threshold";

export function pooledRiskTitle(riskBand: PooledRiskBand): string {
  switch (riskBand) {
    case "none":
      return "No debt selected";
    case "wide":
      return "Wide liquidation buffer";
    case "reduced":
      return "Reduced liquidation buffer";
    case "thin":
      return "Thin liquidation buffer";
    case "at-boundary":
      return "At liquidation boundary";
    case "above-threshold":
      return "Projected above liquidation threshold";
  }
}

export function pooledRiskDescription(riskBand: PooledRiskBand): string {
  switch (riskBand) {
    case "none":
      return "Choose a positive amount to calculate the projected liquidation buffer.";
    case "wide":
      return "At current oracle prices and parameters, the projected health factor has a wide buffer above 1.00.";
    case "reduced":
      return "The position remains above the liquidation boundary, but its projected buffer is reduced.";
    case "thin":
      return "The position is close to the liquidation boundary and small market or parameter changes could cross it.";
    case "at-boundary":
      return "The projected health factor is exactly 1.00, the protocol liquidation boundary.";
    case "above-threshold":
      return "At current oracle prices and parameters, the projected debt is beyond the liquidation boundary.";
  }
}

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
  const startingDebtUsd =
    quote.mode === "existing-position"
      ? Math.max(0, quote.existingDebtUsd ?? 0)
      : 0;
  const projectedDebtUsd = Math.max(0, startingDebtUsd + borrowAmountUsd);
  const projectedLtv = ratio(projectedDebtUsd, collateralValueUsd);
  const borrowLimitLtv = ratio(borrowCapacityUsd, collateralValueUsd);
  const liquidationThresholdLtv = ratio(
    liquidationCapacityUsd,
    collateralValueUsd,
  );
  const liquidationSafetyRatio =
    projectedDebtUsd <= 0
      ? Number.POSITIVE_INFINITY
      : liquidationCapacityUsd / projectedDebtUsd;
  const healthFactor = Number.isFinite(liquidationSafetyRatio)
    ? liquidationSafetyRatio
    : null;
  const liquidationHeadroomUsd = liquidationCapacityUsd - projectedDebtUsd;
  const recommendedLimitUsd = Math.max(0, quote.safeBorrowUsd ?? 0);
  const minimumBorrowUsd = Math.max(0, quote.minimumBorrowUsd ?? 0);
  const recommendedLimitUtilization = ratio(
    borrowAmountUsd,
    recommendedLimitUsd,
  );
  const riskBand = riskBandFromHealthFactor(healthFactor, projectedDebtUsd);
  const reasonCodes: PooledPreviewReasonCode[] = [];
  if (projectedDebtUsd <= 0) reasonCodes.push("no-debt-selected");
  if (projectedDebtUsd > 0 && projectedDebtUsd < minimumBorrowUsd) {
    reasonCodes.push("below-protocol-minimum");
  }
  if (borrowAmountUsd > recommendedLimitUsd) {
    reasonCodes.push("above-recommended-limit");
  } else if (borrowAmountUsd > 0) {
    reasonCodes.push("within-recommended-limit");
  }
  if (riskBand === "at-boundary") {
    reasonCodes.push("at-liquidation-boundary");
  } else if (riskBand === "above-threshold") {
    reasonCodes.push("above-liquidation-threshold");
  }
  const actionable =
    borrowAmountUsd > 0 &&
    recommendedLimitUsd > 0 &&
    borrowAmountUsd <= recommendedLimitUsd &&
    projectedDebtUsd >= minimumBorrowUsd &&
    riskBand !== "at-boundary" &&
    riskBand !== "above-threshold";
  const status =
    liquidationSafetyRatio > 1
      ? "below-liquidation-threshold"
      : "at-or-above-liquidation-threshold";

  return {
    mode: quote.mode,
    startingDebtUsd: roundUsd(startingDebtUsd),
    projectedDebtUsd: roundUsd(projectedDebtUsd),
    collateralValueUsd: roundUsd(collateralValueUsd),
    projectedLtv,
    borrowLimitLtv,
    liquidationThresholdLtv,
    liquidationSafetyRatio,
    healthFactor,
    liquidationHeadroomUsd: roundUsd(liquidationHeadroomUsd),
    recommendedLimitUtilization,
    minimumBorrowUsd: roundUsd(minimumBorrowUsd),
    riskBand,
    actionable,
    reasonCodes,
    status,
  };
}

export function riskBandFromHealthFactor(
  healthFactor: number | null,
  projectedDebtUsd: number,
): PooledRiskBand {
  if (projectedDebtUsd <= 0 || healthFactor === null) return "none";
  if (healthFactor >= 1.6) return "wide";
  if (healthFactor >= 1.2) return "reduced";
  if (healthFactor > 1) return "thin";
  if (healthFactor === 1) return "at-boundary";
  return "above-threshold";
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}
