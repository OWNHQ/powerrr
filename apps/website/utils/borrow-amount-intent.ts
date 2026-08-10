import { amountForUtilization } from "./estimator-ux";

export type BorrowAmountIntent =
  { kind: "relative"; utilizationPercent: number } | { kind: "absolute" };

export function selectedCollateralSignature(tokens: string[]): string {
  return [...new Set(tokens.map((token) => token.toLowerCase()))]
    .sort()
    .join(",");
}

export function amountForBorrowIntent(
  intent: BorrowAmountIntent,
  comparisonCeilingUsd: number,
  currentAmountUsd: number,
): number {
  return intent.kind === "relative"
    ? amountForUtilization(
        comparisonCeilingUsd,
        clampPercent(intent.utilizationPercent),
      )
    : currentAmountUsd;
}

export function relativeIntentForAmount(
  amountUsd: number,
  comparisonCeilingUsd: number,
): BorrowAmountIntent {
  return {
    kind: "relative",
    utilizationPercent:
      comparisonCeilingUsd > 0
        ? clampPercent((Math.max(0, amountUsd) / comparisonCeilingUsd) * 100)
        : 0,
  };
}

function clampPercent(value: number): number {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}
