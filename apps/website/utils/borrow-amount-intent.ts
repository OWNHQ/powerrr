import type { RawAmount } from "@powerrr/shared-types";
import {
  mulDivDown,
  rawAmount,
  scaleRawAmount,
  USDC_DECIMALS,
} from "@powerrr/math";

export type BorrowAmountIntent =
  { kind: "relative"; utilizationPercent: number } | { kind: "absolute" };

export function selectedCollateralSignature(tokens: string[]): string {
  return [...new Set(tokens.map((token) => token.toLowerCase()))]
    .sort()
    .join(",");
}

export function amountForBorrowIntent(
  intent: BorrowAmountIntent,
  comparisonCeiling: RawAmount,
  currentAmount: RawAmount,
): RawAmount {
  if (intent.kind === "absolute") return currentAmount;
  const ceilingRaw = scaleRawAmount(
    BigInt(comparisonCeiling.raw),
    comparisonCeiling.decimals,
    USDC_DECIMALS,
  );
  const basisPoints = BigInt(
    Math.round(clampPercent(intent.utilizationPercent) * 100),
  );
  return rawAmount(mulDivDown(ceilingRaw, basisPoints, 10_000n), USDC_DECIMALS);
}

export function relativeIntentForAmount(
  amount: RawAmount,
  comparisonCeiling: RawAmount,
): BorrowAmountIntent {
  const amountRaw = scaleRawAmount(
    BigInt(amount.raw),
    amount.decimals,
    USDC_DECIMALS,
  );
  const ceilingRaw = scaleRawAmount(
    BigInt(comparisonCeiling.raw),
    comparisonCeiling.decimals,
    USDC_DECIMALS,
  );
  return {
    kind: "relative",
    utilizationPercent:
      ceilingRaw > 0n
        ? clampPercent(Number((amountRaw * 10_000n) / ceilingRaw) / 100)
        : 0,
  };
}

function clampPercent(value: number): number {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}
