import type {
  IsolatedBorrowRoute,
  ProtocolAssetEvaluation,
  ProtocolBorrowQuote,
  RawAmount,
} from "@powerrr/shared-types";
import { buildMorphoBorrowRoute } from "@powerrr/protocol-adapters";
import {
  decimalStringToRaw,
  mulDivDown,
  rawAmountToNumber,
  scaleRawAmount,
  USDC_DECIMALS,
} from "@powerrr/math";

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
  modeledLimitUtilization: number;
  minimumBorrowUsd: number;
  riskBand: PooledRiskBand;
  actionable: boolean;
  reasonCodes: PooledPreviewReasonCode[];
  status:
    | "below-liquidation-threshold"
    | "at-or-above-liquidation-threshold"
    | "not-executable";
  isolatedRoute?: IsolatedBorrowRoute;
};

export type PooledRiskBand =
  | "none"
  | "wide"
  | "reduced"
  | "thin"
  | "at-boundary"
  | "above-threshold"
  | "not-executable";

export function morphoRouteAssetEvaluations(
  quote: ProtocolBorrowQuote,
  route: IsolatedBorrowRoute,
): ProtocolAssetEvaluation[] {
  const candidatesByMarket = new Map(
    (quote.isolatedMarketCapacities ?? []).map((candidate) => [
      candidate.marketId,
      candidate,
    ]),
  );
  const contributionByToken = new Map<string, bigint>();
  const lltvByToken = new Map<string, number>();

  for (const leg of route.legs) {
    const candidate = candidatesByMarket.get(leg.marketId);
    const sources = candidate
      ? candidate.collateralSources?.length
        ? candidate.collateralSources
        : [
            {
              token: candidate.collateralToken,
              symbol: candidate.collateralSymbol,
              convertedBalance: candidate.collateralAvailable,
            },
          ]
      : [];
    const totalSourceRaw = sources.reduce(
      (sum, source) => sum + BigInt(source.convertedBalance.raw),
      0n,
    );
    if (totalSourceRaw <= 0n) continue;
    const legValueRaw = BigInt(leg.collateralValue.raw);
    const legLltv = Number(leg.lltv.numerator) / Number(leg.lltv.denominator);
    let allocatedValueRaw = 0n;
    sources.forEach((source, index) => {
      const contributionRaw =
        index === sources.length - 1
          ? legValueRaw - allocatedValueRaw
          : mulDivDown(
              legValueRaw,
              BigInt(source.convertedBalance.raw),
              totalSourceRaw,
            );
      allocatedValueRaw += contributionRaw;
      const key = source.token.toLowerCase();
      contributionByToken.set(
        key,
        (contributionByToken.get(key) ?? 0n) + contributionRaw,
      );
      lltvByToken.set(key, Math.max(lltvByToken.get(key) ?? 0, legLltv));
    });
  }

  return (quote.assetEvaluations ?? []).flatMap((evaluation) => {
    const key = evaluation.token.toLowerCase();
    const contributionRaw = contributionByToken.get(key) ?? 0n;
    if (contributionRaw <= 0n) return [];
    return [
      {
        ...evaluation,
        contributionUsd: rawAmountToNumber({
          raw: contributionRaw.toString(),
          decimals: USDC_DECIMALS,
        }),
        ...(lltvByToken.has(key)
          ? {
              ltv: lltvByToken.get(key),
              liquidationThreshold: lltvByToken.get(key),
            }
          : {}),
      },
    ];
  });
}

export type PooledPreviewReasonCode =
  | "no-debt-selected"
  | "no-eligible-collateral"
  | "below-protocol-minimum"
  | "within-modeled-limit"
  | "above-modeled-limit"
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
    case "not-executable":
      return "Not available";
  }
}

export function pooledRiskTitleForPreview(
  preview: PooledBorrowPreview,
): string {
  if (preview.riskBand !== "not-executable") {
    return pooledRiskTitle(preview.riskBand);
  }
  if (preview.reasonCodes.includes("no-eligible-collateral")) {
    return "Not available";
  }
  if (preview.reasonCodes.includes("below-protocol-minimum")) {
    return "Below protocol minimum";
  }
  if (preview.reasonCodes.includes("above-modeled-limit")) {
    return "Amount exceeds protocol maximum";
  }
  return "Not available";
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
    case "not-executable":
      return "No liquidation metric is shown because this amount cannot be executed through this path.";
  }
}

export function calculatePooledBorrowPreview(
  quote: ProtocolBorrowQuote,
  borrowAmount: RawAmount,
): PooledBorrowPreview {
  const requestedRaw = scaleRawAmount(
    BigInt(borrowAmount.raw),
    borrowAmount.decimals,
    USDC_DECIMALS,
  );
  const borrowAmountUsd = rawAmountToNumber({
    raw: requestedRaw.toString(),
    decimals: USDC_DECIMALS,
  });
  const isolatedRoute = quote.isolatedMarketCapacities
    ? buildMorphoBorrowRoute(
        quote.isolatedMarketCapacities,
        requestedRaw,
        "rate",
      )
    : undefined;
  const collateralForPreview = isolatedRoute?.legs.length
    ? isolatedRoute.legs.map((leg) => ({
        valueUsd: rawAmountToNumber(leg.collateralValue),
        ltv: Number(leg.lltv.numerator) / Number(leg.lltv.denominator),
        liquidationThreshold:
          Number(leg.lltv.numerator) / Number(leg.lltv.denominator),
      }))
    : quote.collateralUsed;
  const collateralValueUsd = collateralForPreview.reduce(
    (sum, item) => sum + item.valueUsd,
    0,
  );
  const borrowCapacityUsd = collateralForPreview.reduce(
    (sum, item) => sum + item.valueUsd * (item.ltv ?? 0),
    0,
  );
  const liquidationCapacityUsd = collateralForPreview.reduce(
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
  const liquidationHeadroomUsd = liquidationCapacityUsd - projectedDebtUsd;
  const modeledLimitUsd = pooledBorrowAvailableUsd(quote);
  const minimumBorrowUsd = Math.max(0, quote.minimumBorrowUsd ?? 0);
  const startingDebtRaw = decimalStringToRaw(
    quote.mode === "existing-position"
      ? Math.max(0, quote.existingDebtUsd ?? 0).toFixed(USDC_DECIMALS)
      : "0",
    USDC_DECIMALS,
  );
  const projectedDebtRaw = startingDebtRaw + requestedRaw;
  const modeledLimitRaw = pooledBorrowAvailableRaw(quote);
  const minimumBorrowRaw = BigInt(
    quote.capacityBreakdown?.exact.minimumBorrow?.raw ?? "0",
  );
  const liquidationLimitRaw = quote.collateralUsed.reduce(
    (sum, item) =>
      sum +
      mulDivDown(
        BigInt(item.valueExact.raw),
        BigInt(item.liquidationThresholdExact.numerator),
        BigInt(item.liquidationThresholdExact.denominator),
      ),
    0n,
  );
  const modeledLimitUtilization = ratio(borrowAmountUsd, modeledLimitUsd);
  const minimumBorrowBlocksMarket =
    quote.capacityBreakdown?.bindingConstraint === "minimum-borrow";
  const reasonCodes: PooledPreviewReasonCode[] = [];
  if (projectedDebtUsd <= 0) reasonCodes.push("no-debt-selected");
  if (
    requestedRaw > 0n &&
    modeledLimitRaw <= 0n &&
    !minimumBorrowBlocksMarket
  ) {
    reasonCodes.push("no-eligible-collateral");
  }
  if (
    requestedRaw > 0n &&
    (minimumBorrowBlocksMarket || projectedDebtRaw < minimumBorrowRaw)
  ) {
    reasonCodes.push("below-protocol-minimum");
  }
  if (requestedRaw > modeledLimitRaw) {
    reasonCodes.push("above-modeled-limit");
  } else if (borrowAmountUsd > 0) {
    reasonCodes.push("within-modeled-limit");
  }
  const actionable = isolatedRoute
    ? requestedRaw > 0n &&
      isolatedRoute.feasible &&
      requestedRaw <= modeledLimitRaw
    : requestedRaw > 0n &&
      modeledLimitRaw > 0n &&
      requestedRaw <= modeledLimitRaw &&
      projectedDebtRaw >= minimumBorrowRaw &&
      projectedDebtRaw < liquidationLimitRaw;
  const calculatedHealthFactor =
    isolatedRoute?.worstHealthFactor ??
    (Number.isFinite(liquidationSafetyRatio) ? liquidationSafetyRatio : null);
  const healthFactor = actionable ? calculatedHealthFactor : null;
  const riskBand: PooledRiskBand =
    projectedDebtUsd <= 0
      ? "none"
      : actionable
        ? riskBandFromHealthFactor(healthFactor, projectedDebtUsd)
        : "not-executable";
  if (riskBand === "at-boundary") {
    reasonCodes.push("at-liquidation-boundary");
  } else if (riskBand === "above-threshold") {
    reasonCodes.push("above-liquidation-threshold");
  }
  const status =
    riskBand === "not-executable"
      ? "not-executable"
      : (healthFactor ?? liquidationSafetyRatio) > 1
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
    modeledLimitUtilization,
    minimumBorrowUsd: roundUsd(minimumBorrowUsd),
    riskBand,
    actionable,
    reasonCodes,
    status,
    ...(isolatedRoute ? { isolatedRoute } : {}),
  };
}

export function pooledBorrowAvailableUsd(quote: ProtocolBorrowQuote): number {
  return rawAmountToNumber(quote.exactMaximum);
}

export function pooledBorrowAvailableRaw(quote: ProtocolBorrowQuote): bigint {
  return scaleRawAmount(
    BigInt(quote.exactMaximum.raw),
    quote.exactMaximum.decimals,
    USDC_DECIMALS,
  );
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
