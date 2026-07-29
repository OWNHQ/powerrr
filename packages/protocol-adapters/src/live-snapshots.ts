import {
  calculateAaveLikeBorrow,
  calculateCompoundBorrow,
  calculateConfidenceScore,
  calculateMorphoMarket,
  riskLevelFromHealthFactor,
  roundUsd,
  safetyBufferForProfile,
} from "@powerrr/math";
import type {
  CollateralUsed,
  ProtocolAssetEvaluation,
  ProtocolBorrowQuote,
  QuoteMode,
  QuoteProvenance,
  RateType,
  SafetyProfile,
} from "@powerrr/shared-types";

export type LiveConfidencePenalties = {
  sourcePenalty: number;
  stalenessPenalty: number;
  fallbackPenalty: number;
  complexityPenalty: number;
  liquidityPenalty: number;
};

export type LiveProtocolSnapshot = {
  protocolId: string;
  protocolLabel: string;
  familyId: string;
  familyLabel: string;
  chainId: number;
  mode: QuoteMode;
  targetBorrowAsset: string;
  rateType?: RateType;
  indicativeApr?: number | null;
  annualRateValue?: number | null;
  annualRateConvention?: "apr" | "apy";
  rateSourceId?: string;
  existingDebtUsd: number;
  availableLiquidityUsd: number;
  minimumBorrowUsd?: number;
  source: string;
  sourceType: QuoteProvenance["sourceType"];
  freshnessSeconds?: number;
  fetchedAt?: string;
  observedAt?: string;
  blockNumber?: string;
  blockTimestamp?: string;
  now?: Date;
  assumptions?: string[];
  warnings?: string[];
  assetEvaluations?: ProtocolAssetEvaluation[];
  confidencePenalties: LiveConfidencePenalties;
};

export type LiveCollateralSnapshot = {
  token: `0x${string}`;
  symbol: string;
  valueUsd: number;
  ltv: number;
  liquidationThreshold: number;
  marketId?: string;
  vaultId?: string;
};

export type AaveLikeLiveSnapshot = LiveProtocolSnapshot & {
  kind?: "aave-like";
  liquidationRisk?: Extract<
    ProtocolBorrowQuote["liquidationRisk"],
    "health-factor" | "vault-specific"
  >;
  safetyProfile: SafetyProfile;
  targetHealthFactor: number;
  collateral: LiveCollateralSnapshot[];
};

export type MorphoLiveMarketSnapshot = {
  token: `0x${string}`;
  symbol: string;
  valueUsd: number;
  lltv: number;
  marketId: string;
  availableLiquidityUsd?: number;
  borrowApy: number | null;
  priceObservedAt?: string;
  freshnessSeconds?: number;
};

export type MorphoLiveSnapshot = LiveProtocolSnapshot & {
  kind?: "morpho";
  safetyProfile: SafetyProfile;
  markets: MorphoLiveMarketSnapshot[];
};

export type CompoundLiveCollateralSnapshot = {
  token: `0x${string}`;
  symbol: string;
  valueUsd: number;
  borrowCollateralFactor: number;
  liquidateCollateralFactor: number;
};

export type CompoundLiveSnapshot = LiveProtocolSnapshot & {
  kind?: "compound";
  safetyProfile: SafetyProfile;
  collateral: CompoundLiveCollateralSnapshot[];
};

export type LiveQuoteSnapshot =
  | (AaveLikeLiveSnapshot & { kind: "aave-like" })
  | (MorphoLiveSnapshot & { kind: "morpho" })
  | (CompoundLiveSnapshot & { kind: "compound" });

export type LiveSnapshotQuoteInput = {
  snapshots: LiveQuoteSnapshot[];
  includeProtocols?: string[];
};

export function quoteLiveSnapshots(
  input: LiveSnapshotQuoteInput,
): ProtocolBorrowQuote[] {
  const include = input.includeProtocols
    ? new Set(input.includeProtocols)
    : null;

  return input.snapshots
    .filter(
      (snapshot) =>
        include === null ||
        include.has(snapshot.protocolId) ||
        include.has(snapshot.familyId),
    )
    .map((snapshot) => {
      if (snapshot.kind === "morpho") {
        return quoteMorphoLiveSnapshot(snapshot);
      }

      if (snapshot.kind === "compound") {
        return quoteCompoundLiveSnapshot(snapshot);
      }

      return quoteAaveLikeLiveSnapshot(snapshot);
    })
    .sort(sortLiveQuotes);
}

export function quoteAaveLikeLiveSnapshot(
  input: AaveLikeLiveSnapshot,
): ProtocolBorrowQuote {
  const capacity = calculateAaveLikeBorrow({
    collateral: input.collateral.map((item) => ({
      valueUsd: item.valueUsd,
      ltv: item.ltv,
      liquidationThreshold: item.liquidationThreshold,
    })),
    existingDebtUsd: input.existingDebtUsd,
    availableLiquidityUsd: input.availableLiquidityUsd,
    targetHealthFactor: input.targetHealthFactor,
    safetyBuffer: safetyBufferForProfile(input.safetyProfile),
  });

  return buildLiveQuote({
    input,
    theoreticalBorrowUsd: capacity.theoreticalBorrowUsd,
    safeBorrowUsd: capacity.safeBorrowUsd,
    liquidationRisk: input.liquidationRisk ?? "health-factor",
    collateralUsed: input.collateral.map((item) =>
      collateralUsedFromSnapshot(item),
    ),
    healthFactor: capacity.healthFactor,
    warnings: input.warnings ?? [],
  });
}

export function quoteMorphoLiveSnapshot(
  input: MorphoLiveSnapshot,
): ProtocolBorrowQuote {
  const marketQuotes = input.markets.map((market) => {
    const capacity = calculateMorphoMarket({
      collateralValueUsd: market.valueUsd,
      lltv: market.lltv,
      borrowedUsd: input.existingDebtUsd,
      availableLiquidityUsd:
        market.availableLiquidityUsd ?? input.availableLiquidityUsd,
      safetyBuffer: safetyBufferForProfile(input.safetyProfile),
    });

    return {
      market,
      capacity,
    };
  });
  const best = marketQuotes.sort(
    (a, b) => b.capacity.safeBorrowUsd - a.capacity.safeBorrowUsd,
  )[0];

  if (!best) {
    return buildLiveQuote({
      input,
      theoreticalBorrowUsd: 0,
      safeBorrowUsd: 0,
      liquidationRisk: "ltv-threshold",
      collateralUsed: [],
      healthFactor: null,
      warnings: [
        ...(input.warnings ?? []),
        "No live Morpho market snapshot matched eligible collateral.",
      ],
    });
  }

  return buildLiveQuote({
    input: {
      ...input,
      availableLiquidityUsd:
        best.market.availableLiquidityUsd ?? input.availableLiquidityUsd,
      indicativeApr: null,
      annualRateValue: best.market.borrowApy,
      annualRateConvention: "apy",
      rateSourceId: `morpho-blue:${best.market.marketId}`,
      ...(best.market.priceObservedAt
        ? { observedAt: best.market.priceObservedAt }
        : {}),
      ...(best.market.freshnessSeconds === undefined
        ? {}
        : { freshnessSeconds: best.market.freshnessSeconds }),
      assumptions: [
        ...(input.assumptions ?? []),
        `Selected isolated market ${best.market.marketId}.`,
      ],
    },
    theoreticalBorrowUsd: best.capacity.theoreticalBorrowUsd,
    safeBorrowUsd: best.capacity.safeBorrowUsd,
    liquidationRisk: "ltv-threshold",
    collateralUsed: [
      {
        token: best.market.token,
        symbol: best.market.symbol,
        valueUsd: roundUsd(best.market.valueUsd),
        ltv: best.market.lltv,
        liquidationThreshold: best.market.lltv,
        marketId: best.market.marketId,
      },
    ],
    healthFactor: best.capacity.healthFactor,
    warnings: input.warnings ?? [],
  });
}

export function quoteCompoundLiveSnapshot(
  input: CompoundLiveSnapshot,
): ProtocolBorrowQuote {
  const capacity = calculateCompoundBorrow({
    collateral: input.collateral.map((item) => ({
      valueUsd: item.valueUsd,
      borrowCollateralFactor: item.borrowCollateralFactor,
      liquidateCollateralFactor: item.liquidateCollateralFactor,
    })),
    existingDebtUsd: input.existingDebtUsd,
    availableBaseLiquidityUsd: input.availableLiquidityUsd,
    safetyBuffer: safetyBufferForProfile(input.safetyProfile),
  });

  const minimumBorrowUsd = Math.max(0, input.minimumBorrowUsd ?? 0);
  const belowMinimum =
    capacity.safeBorrowUsd > 0 &&
    input.existingDebtUsd + capacity.safeBorrowUsd < minimumBorrowUsd;

  return buildLiveQuote({
    input,
    theoreticalBorrowUsd: capacity.theoreticalBorrowUsd,
    safeBorrowUsd: belowMinimum ? 0 : capacity.safeBorrowUsd,
    liquidationRisk: "ltv-threshold",
    collateralUsed: input.collateral.map((item) => ({
      token: item.token,
      symbol: item.symbol,
      valueUsd: roundUsd(item.valueUsd),
      ltv: item.borrowCollateralFactor,
      liquidationThreshold: item.liquidateCollateralFactor,
    })),
    healthFactor: capacity.healthFactor,
    warnings: [
      ...(input.warnings ?? []),
      ...(belowMinimum
        ? [
            `Maximum projected debt is below Compound's ${roundUsd(minimumBorrowUsd)} USDC minimum borrow.`,
          ]
        : []),
    ],
  });
}

function buildLiveQuote(input: {
  input: LiveProtocolSnapshot;
  theoreticalBorrowUsd: number | null;
  safeBorrowUsd: number | null;
  liquidationRisk: ProtocolBorrowQuote["liquidationRisk"];
  collateralUsed: CollateralUsed[];
  healthFactor: number | null;
  warnings: string[];
}): ProtocolBorrowQuote {
  const confidence = calculateConfidenceScore(input.input.confidencePenalties);
  const collateralValueUsd = input.collateralUsed.reduce(
    (sum, item) => sum + item.valueUsd,
    0,
  );
  const theoreticalBorrowUsd = Math.max(0, input.theoreticalBorrowUsd ?? 0);
  const recommendedMaxUsd = Math.max(0, input.safeBorrowUsd ?? 0);
  const liquidityLimitUsd = Math.max(0, input.input.availableLiquidityUsd);
  const minimumBorrowUsd = Math.max(0, input.input.minimumBorrowUsd ?? 0);
  const bindingConstraint =
    collateralValueUsd <= 0
      ? "no-eligible-collateral"
      : minimumBorrowUsd > 0 && recommendedMaxUsd === 0
        ? "minimum-borrow"
        : liquidityLimitUsd <= recommendedMaxUsd + 0.01
          ? "liquidity"
          : recommendedMaxUsd + 0.01 < theoreticalBorrowUsd
            ? "safety-buffer"
            : "collateral";

  return {
    protocolId: input.input.protocolId,
    protocolLabel: input.input.protocolLabel,
    familyId: input.input.familyId,
    familyLabel: input.input.familyLabel,
    chainId: input.input.chainId,
    mode: input.input.mode,
    theoreticalBorrowUsd:
      input.theoreticalBorrowUsd === null
        ? null
        : roundUsd(input.theoreticalBorrowUsd),
    safeBorrowUsd:
      input.safeBorrowUsd === null ? null : roundUsd(input.safeBorrowUsd),
    existingDebtUsd: roundUsd(input.input.existingDebtUsd),
    availableLiquidityUsd: roundUsd(input.input.availableLiquidityUsd),
    ...(input.input.minimumBorrowUsd === undefined
      ? {}
      : { minimumBorrowUsd: roundUsd(input.input.minimumBorrowUsd) }),
    targetBorrowAsset: input.input.targetBorrowAsset,
    rateType: input.input.rateType ?? "variable",
    indicativeApr: input.input.indicativeApr ?? null,
    annualRate:
      input.input.annualRateValue === null ||
      input.input.annualRateValue === undefined
        ? null
        : {
            value: input.input.annualRateValue,
            convention: input.input.annualRateConvention ?? "apr",
            rateType: input.input.rateType ?? "variable",
            sourceId: input.input.rateSourceId ?? input.input.protocolId,
          },
    liquidationRisk: input.liquidationRisk,
    collateralUsed: input.collateralUsed,
    ...(input.input.assetEvaluations
      ? { assetEvaluations: input.input.assetEvaluations }
      : {}),
    capacityBreakdown: {
      collateralValueUsd: roundUsd(collateralValueUsd),
      protocolBorrowLimitUsd: roundUsd(theoreticalBorrowUsd),
      safetyAdjustedLimitUsd: roundUsd(
        bindingConstraint === "liquidity"
          ? theoreticalBorrowUsd
          : recommendedMaxUsd,
      ),
      liquidityLimitUsd: roundUsd(liquidityLimitUsd),
      ...(minimumBorrowUsd > 0
        ? { minimumBorrowUsd: roundUsd(minimumBorrowUsd) }
        : {}),
      recommendedMaxUsd: roundUsd(recommendedMaxUsd),
      bindingConstraint,
    },
    healthFactor: input.healthFactor,
    riskLevel: riskLevelFromHealthFactor(input.healthFactor),
    confidence: confidence.confidence,
    confidenceScore: confidence.score,
    stale: (input.input.freshnessSeconds ?? 0) > 60,
    timestamp: (input.input.now ?? new Date()).toISOString(),
    assumptions: input.input.assumptions ?? [],
    warnings: input.warnings,
    provenance: [
      {
        source: input.input.source,
        sourceType: input.input.sourceType,
        ...(input.input.freshnessSeconds === undefined
          ? {}
          : { freshnessSeconds: input.input.freshnessSeconds }),
        freshnessStatus:
          input.input.freshnessSeconds === undefined
            ? "unknown"
            : input.input.freshnessSeconds > 60
              ? "stale"
              : "fresh",
        fetchedAt:
          input.input.fetchedAt ??
          (input.input.now ?? new Date()).toISOString(),
        ...(input.input.observedAt
          ? { observedAt: input.input.observedAt }
          : {}),
        ...(input.input.blockNumber
          ? { blockNumber: input.input.blockNumber }
          : {}),
        ...(input.input.blockTimestamp
          ? { blockTimestamp: input.input.blockTimestamp }
          : {}),
      },
    ],
  };
}

function collateralUsedFromSnapshot(
  input: LiveCollateralSnapshot,
): CollateralUsed {
  return {
    token: input.token,
    symbol: input.symbol,
    valueUsd: roundUsd(input.valueUsd),
    ltv: input.ltv,
    liquidationThreshold: input.liquidationThreshold,
    ...(input.marketId ? { marketId: input.marketId } : {}),
    ...(input.vaultId ? { vaultId: input.vaultId } : {}),
  };
}

function sortLiveQuotes(
  a: ProtocolBorrowQuote,
  b: ProtocolBorrowQuote,
): number {
  const safeA = a.safeBorrowUsd ?? -1;
  const safeB = b.safeBorrowUsd ?? -1;

  if (safeA !== safeB) {
    return safeB - safeA;
  }

  return b.confidenceScore - a.confidenceScore;
}
