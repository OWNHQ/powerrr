import {
  calculateAaveLikeBorrow,
  calculateCompoundBorrow,
  calculateConfidenceScore,
  calculateMorphoMarket,
  riskLevelFromHealthFactor,
  roundUsd,
  safetyBufferForProfile,
  minBigInt,
  mulDivDown,
  rawAmount,
  rawAmountToNumber,
  decimalStringToRaw,
  USDC_DECIMALS,
} from "@powerrr/math";
import type {
  CollateralUsed,
  ProtocolAssetEvaluation,
  ProtocolBorrowQuote,
  QuoteMode,
  QuoteProvenance,
  RateType,
  SafetyProfile,
  RawAmount,
  RawRatio,
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
  annualRateExact?: RawRatio;
  annualRateTransform?: "ratio" | "per-second-apy";
  existingDebtUsd: number;
  availableLiquidityUsd: number;
  minimumBorrowUsd?: number;
  availableLiquidityExact: RawAmount;
  existingDebtExact: RawAmount;
  minimumBorrowExact?: RawAmount;
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
  valueExact: RawAmount;
  ltvExact: RawRatio;
  liquidationThresholdExact: RawRatio;
  marketId?: string;
  vaultId?: string;
};

export type RawCollateralSource = {
  token: `0x${string}`;
  symbol: string;
  convertedBalanceRaw: string;
};

export type RawCollateralGroup = {
  protocolToken: `0x${string}`;
  protocolSymbol: string;
  protocolDecimals: number;
  sources: RawCollateralSource[];
  remainingSupplyRaw?: string;
  supplyCapRaw?: string;
  currentSupplyRaw?: string;
  priceRaw: string;
  valueNumeratorScale: string;
  valueDenominator: string;
  ltv: RawRatio;
  liquidationThreshold: RawRatio;
  marketId?: string;
  active?: boolean;
  frozen?: boolean;
  paused?: boolean;
  collateralEnabled?: boolean;
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
  rawCollateral: RawCollateralGroup[];
};

export type MorphoLiveMarketSnapshot = {
  token: `0x${string}`;
  symbol: string;
  valueUsd: number;
  valueExact: RawAmount;
  lltv: number;
  marketId: string;
  availableLiquidityUsd?: number;
  availableLiquidityExact: RawAmount;
  borrowApy: number | null;
  loanToken: `0x${string}`;
  collateralToken: `0x${string}`;
  oracle: `0x${string}`;
  irm: `0x${string}`;
  totalSupplyAssets: RawAmount;
  totalBorrowAssets: RawAmount;
  lastUpdate: string;
  fee: RawRatio;
  borrowRatePerSecond: RawRatio;
  priceObservedAt?: string;
  freshnessSeconds?: number;
  rawCollateral: RawCollateralGroup;
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
  valueExact: RawAmount;
  borrowCollateralFactorExact: RawRatio;
  liquidateCollateralFactorExact: RawRatio;
};

export type CompoundLiveSnapshot = LiveProtocolSnapshot & {
  kind?: "compound";
  safetyProfile: SafetyProfile;
  collateral: CompoundLiveCollateralSnapshot[];
  rawCollateral: RawCollateralGroup[];
};

export type LiveQuoteSnapshot =
  | (AaveLikeLiveSnapshot & { kind: "aave-like" })
  | (MorphoLiveSnapshot & { kind: "morpho" })
  | (CompoundLiveSnapshot & { kind: "compound" });

export type AaveLikeProtocolSnapshot = AaveLikeLiveSnapshot;
export type CompoundProtocolSnapshot = CompoundLiveSnapshot;
export type MorphoMarketSnapshot = MorphoLiveMarketSnapshot;

export type LiveSnapshotQuoteInput = {
  snapshots: LiveQuoteSnapshot[];
  includeProtocols?: string[];
};

export function projectLiveSnapshots(
  snapshots: LiveQuoteSnapshot[],
  selectedCollateralTokens: string[],
): LiveQuoteSnapshot[] {
  const selected = new Set(
    selectedCollateralTokens.map((token) => token.toLowerCase()),
  );

  return snapshots.map((snapshot) => {
    const groups =
      snapshot.kind === "morpho"
        ? snapshot.markets.map((market) => market.rawCollateral)
        : snapshot.rawCollateral;
    const projection = projectRawCollateral(groups, selected);
    const assetEvaluations = (snapshot.assetEvaluations ?? []).map(
      (evaluation) => {
        const projected = projectAssetEvaluation(evaluation, selected);
        const contributionRaw = projection.contributions.get(
          evaluation.token.toLowerCase(),
        );
        if (contributionRaw === undefined || contributionRaw <= 0n) {
          return projected;
        }
        return {
          ...projected,
          contributionUsd: rawAmountToNumber(
            rawAmount(contributionRaw, USDC_DECIMALS),
          ),
          eligibilityStatus: evaluation.reasonCodes.includes(
            "CONVERSION_REQUIRED",
          )
            ? "supported"
            : "included",
        } satisfies ProtocolAssetEvaluation;
      },
    );

    if (snapshot.kind === "morpho") {
      return {
        ...snapshot,
        assetEvaluations,
        markets: snapshot.markets.flatMap((market) => {
          const collateral = projection.collateral.find(
            (item) => item.marketId === market.marketId,
          );
          return collateral
            ? [
                {
                  ...market,
                  token: collateral.token,
                  symbol: collateral.symbol,
                  valueUsd: collateral.valueUsd,
                  valueExact: collateral.valueExact,
                },
              ]
            : [];
        }),
      };
    }

    if (snapshot.kind === "compound") {
      return {
        ...snapshot,
        assetEvaluations,
        collateral: projection.collateral.map((item) => ({
          token: item.token,
          symbol: item.symbol,
          valueUsd: item.valueUsd,
          valueExact: item.valueExact,
          borrowCollateralFactor: item.ltv,
          liquidateCollateralFactor: item.liquidationThreshold,
          borrowCollateralFactorExact: item.ltvExact,
          liquidateCollateralFactorExact: item.liquidationThresholdExact,
        })),
      };
    }

    return {
      ...snapshot,
      assetEvaluations,
      collateral: projection.collateral,
    };
  });
}

function projectRawCollateral(
  groups: RawCollateralGroup[],
  selected: Set<string>,
): {
  collateral: LiveCollateralSnapshot[];
  contributions: Map<string, bigint>;
} {
  const collateral: LiveCollateralSnapshot[] = [];
  const contributions = new Map<string, bigint>();
  for (const group of groups) {
    const sources = group.sources.filter((source) =>
      selected.has(source.token.toLowerCase()),
    );
    const totalRaw = sources.reduce(
      (sum, source) => sum + BigInt(source.convertedBalanceRaw),
      0n,
    );
    const usableRaw = group.remainingSupplyRaw
      ? minBigInt(totalRaw, BigInt(group.remainingSupplyRaw))
      : totalRaw;
    if (usableRaw <= 0n) continue;
    const valueRaw = mulDivDown(
      usableRaw * BigInt(group.priceRaw),
      BigInt(group.valueNumeratorScale),
      BigInt(group.valueDenominator),
    );
    if (valueRaw <= 0n) continue;
    const ltv = ratioToNumber(group.ltv);
    const liquidationThreshold = ratioToNumber(group.liquidationThreshold);
    collateral.push({
      token: sources[0]!.token,
      symbol: [...new Set(sources.map((source) => source.symbol))].join(" + "),
      valueUsd: rawAmountToNumber(rawAmount(valueRaw, USDC_DECIMALS)),
      valueExact: rawAmount(valueRaw, USDC_DECIMALS),
      ltv,
      liquidationThreshold,
      ltvExact: group.ltv,
      liquidationThresholdExact: group.liquidationThreshold,
      ...(group.marketId ? { marketId: group.marketId } : {}),
    });

    let allocated = 0n;
    sources.forEach((source, index) => {
      const contribution =
        index === sources.length - 1
          ? valueRaw - allocated
          : mulDivDown(valueRaw, BigInt(source.convertedBalanceRaw), totalRaw);
      allocated += contribution;
      const key = source.token.toLowerCase();
      contributions.set(key, (contributions.get(key) ?? 0n) + contribution);
    });
  }
  return { collateral, contributions };
}

function ratioToNumber(value: RawRatio): number {
  return Number(value.numerator) / Number(value.denominator);
}

function projectAssetEvaluation(
  evaluation: ProtocolAssetEvaluation,
  selected: Set<string>,
): ProtocolAssetEvaluation {
  const isSelected = selected.has(evaluation.token.toLowerCase());
  if (isSelected) return evaluation;

  const { contributionUsd: _contributionUsd, ...withoutContribution } =
    evaluation;
  const supported =
    evaluation.eligibilityStatus === "included" ||
    evaluation.eligibilityStatus === "supported";
  return {
    ...withoutContribution,
    selectionStatus:
      evaluation.selectionStatus === "unselectable"
        ? "unselectable"
        : "not-selected",
    eligibilityStatus: supported ? "supported" : evaluation.eligibilityStatus,
    reasonCodes: evaluation.reasonCodes.includes("CONVERSION_REQUIRED")
      ? ["CONVERSION_REQUIRED"]
      : supported
        ? ["SUPPORTED_NOT_SELECTED"]
        : evaluation.reasonCodes,
    reason: evaluation.reasonCodes.includes("CONVERSION_REQUIRED")
      ? evaluation.reason
      : supported
        ? "Supported by this protocol, but not selected as collateral."
        : evaluation.reason,
  };
}

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
  const exact = exactCollateralCapacity(
    input.collateral,
    input.existingDebtExact,
  );
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
  const debtRaw = BigInt(input.existingDebtExact.raw);
  const targetHealthFactorRaw = decimalStringToRaw(
    input.targetHealthFactor.toString(),
    6,
  );
  const healthFactorDebtLimitRaw = mulDivDown(
    exact.liquidationLimitRaw,
    1_000_000n,
    targetHealthFactorRaw,
  );
  const healthFactorHeadroomRaw =
    healthFactorDebtLimitRaw > debtRaw
      ? healthFactorDebtLimitRaw - debtRaw
      : 0n;
  const safetyAdjustedRaw = mulDivDown(
    exact.borrowLimitRaw,
    BigInt(Math.round(safetyBufferForProfile(input.safetyProfile) * 100)),
    100n,
  );

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
    exactProtocolBorrowLimitRaw: exact.borrowLimitRaw,
    exactRecommendedMaximumRaw: minBigInt(
      safetyAdjustedRaw,
      healthFactorHeadroomRaw,
      BigInt(input.availableLiquidityExact.raw),
    ),
  });
}

export function quoteMorphoLiveSnapshot(
  input: MorphoLiveSnapshot,
): ProtocolBorrowQuote {
  const marketQuotes = input.markets.map((market) => {
    const exactBorrowLimitRaw = mulDivDown(
      BigInt(market.valueExact.raw),
      BigInt(market.rawCollateral.ltv.numerator),
      BigInt(market.rawCollateral.ltv.denominator),
    );
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
      exactBorrowLimitRaw,
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
      exactProtocolBorrowLimitRaw: 0n,
      exactRecommendedMaximumRaw: 0n,
    });
  }

  return buildLiveQuote({
    input: {
      ...input,
      availableLiquidityUsd:
        best.market.availableLiquidityUsd ?? input.availableLiquidityUsd,
      availableLiquidityExact: best.market.availableLiquidityExact,
      indicativeApr: null,
      annualRateValue: best.market.borrowApy,
      annualRateExact: best.market.borrowRatePerSecond,
      annualRateTransform: "per-second-apy",
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
        valueExact: best.market.valueExact,
        ltv: best.market.lltv,
        liquidationThreshold: best.market.lltv,
        ltvExact: best.market.rawCollateral.ltv,
        liquidationThresholdExact:
          best.market.rawCollateral.liquidationThreshold,
        marketId: best.market.marketId,
      },
    ],
    healthFactor: best.capacity.healthFactor,
    warnings: input.warnings ?? [],
    exactProtocolBorrowLimitRaw: best.exactBorrowLimitRaw,
    exactRecommendedMaximumRaw: minBigInt(
      mulDivDown(
        best.exactBorrowLimitRaw,
        BigInt(Math.round(safetyBufferForProfile(input.safetyProfile) * 100)),
        100n,
      ),
      BigInt(best.market.availableLiquidityExact.raw),
    ),
  });
}

export function quoteCompoundLiveSnapshot(
  input: CompoundLiveSnapshot,
): ProtocolBorrowQuote {
  const exact = exactCompoundCapacity(
    input.collateral,
    input.existingDebtExact,
  );
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
  const minimumBorrowRaw = BigInt(input.minimumBorrowExact?.raw ?? "0");
  const maximumNewDebtRaw = minBigInt(
    exact.borrowLimitRaw,
    BigInt(input.availableLiquidityExact.raw),
  );
  const projectedMaximumDebtRaw =
    BigInt(input.existingDebtExact.raw) + maximumNewDebtRaw;
  const belowMinimum =
    maximumNewDebtRaw > 0n && projectedMaximumDebtRaw < minimumBorrowRaw;

  return buildLiveQuote({
    input,
    theoreticalBorrowUsd: capacity.theoreticalBorrowUsd,
    safeBorrowUsd: belowMinimum ? 0 : capacity.safeBorrowUsd,
    liquidationRisk: "ltv-threshold",
    collateralUsed: input.collateral.map((item) => ({
      token: item.token,
      symbol: item.symbol,
      valueUsd: roundUsd(item.valueUsd),
      valueExact: item.valueExact,
      ltv: item.borrowCollateralFactor,
      liquidationThreshold: item.liquidateCollateralFactor,
      ltvExact: item.borrowCollateralFactorExact,
      liquidationThresholdExact: item.liquidateCollateralFactorExact,
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
    exactProtocolBorrowLimitRaw: exact.borrowLimitRaw,
    exactRecommendedMaximumRaw: minBigInt(
      mulDivDown(
        exact.borrowLimitRaw,
        BigInt(Math.round(safetyBufferForProfile(input.safetyProfile) * 100)),
        100n,
      ),
      BigInt(input.availableLiquidityExact.raw),
    ),
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
  exactProtocolBorrowLimitRaw: bigint;
  exactRecommendedMaximumRaw: bigint;
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
  const liquidityRaw = BigInt(input.input.availableLiquidityExact.raw);
  const minimumBorrowRaw = BigInt(input.input.minimumBorrowExact?.raw ?? "0");
  const unconstrainedMaximumRaw = minBigInt(
    input.exactProtocolBorrowLimitRaw,
    liquidityRaw,
  );
  const meetsMinimum =
    minimumBorrowRaw === 0n ||
    BigInt(input.input.existingDebtExact.raw) + unconstrainedMaximumRaw >=
      minimumBorrowRaw;
  const exactMaximumRaw = meetsMinimum ? unconstrainedMaximumRaw : 0n;
  const exactRecommendedRaw = meetsMinimum
    ? minBigInt(input.exactRecommendedMaximumRaw, liquidityRaw)
    : 0n;
  const exactCollateralRaw = input.collateralUsed.reduce(
    (sum, item) => sum + BigInt(item.valueExact.raw),
    0n,
  );
  const bindingConstraint =
    exactCollateralRaw <= 0n
      ? "no-eligible-collateral"
      : !meetsMinimum
        ? "minimum-borrow"
        : liquidityRaw <= input.exactRecommendedMaximumRaw
          ? "liquidity"
          : input.exactRecommendedMaximumRaw < input.exactProtocolBorrowLimitRaw
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
    indicativeApr:
      input.input.annualRateConvention === "apy"
        ? (input.input.indicativeApr ?? null)
        : exactAnnualRateValue(input.input),
    annualRate:
      exactAnnualRateValue(input.input) === null
        ? null
        : {
            value: exactAnnualRateValue(input.input)!,
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
      exact: {
        collateralValue: rawAmount(exactCollateralRaw, USDC_DECIMALS),
        protocolBorrowLimit: rawAmount(
          input.exactProtocolBorrowLimitRaw,
          USDC_DECIMALS,
        ),
        safetyAdjustedLimit: rawAmount(exactRecommendedRaw, USDC_DECIMALS),
        liquidityLimit: input.input.availableLiquidityExact,
        recommendedMaximum: rawAmount(exactRecommendedRaw, USDC_DECIMALS),
        ...(input.input.minimumBorrowExact
          ? { minimumBorrow: input.input.minimumBorrowExact }
          : {}),
      },
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
    exactMaximum: rawAmount(exactMaximumRaw, USDC_DECIMALS),
  };
}

function exactAnnualRateValue(input: LiveProtocolSnapshot): number | null {
  if (input.annualRateExact) {
    const ratio = ratioToNumber(input.annualRateExact);
    return input.annualRateTransform === "per-second-apy"
      ? Math.expm1(ratio * 31_536_000)
      : ratio;
  }
  return input.annualRateValue ?? input.indicativeApr ?? null;
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
    valueExact: input.valueExact,
    ltvExact: input.ltvExact,
    liquidationThresholdExact: input.liquidationThresholdExact,
    ...(input.marketId ? { marketId: input.marketId } : {}),
    ...(input.vaultId ? { vaultId: input.vaultId } : {}),
  };
}

function exactCollateralCapacity(
  collateral: LiveCollateralSnapshot[],
  existingDebt: RawAmount,
): { borrowLimitRaw: bigint; liquidationLimitRaw: bigint } {
  const grossBorrowRaw = collateral.reduce(
    (sum, item) =>
      sum +
      mulDivDown(
        BigInt(item.valueExact.raw),
        BigInt(item.ltvExact.numerator),
        BigInt(item.ltvExact.denominator),
      ),
    0n,
  );
  const liquidationLimitRaw = collateral.reduce(
    (sum, item) =>
      sum +
      mulDivDown(
        BigInt(item.valueExact.raw),
        BigInt(item.liquidationThresholdExact.numerator),
        BigInt(item.liquidationThresholdExact.denominator),
      ),
    0n,
  );
  const debtRaw = BigInt(existingDebt.raw);
  return {
    borrowLimitRaw: grossBorrowRaw > debtRaw ? grossBorrowRaw - debtRaw : 0n,
    liquidationLimitRaw,
  };
}

function exactCompoundCapacity(
  collateral: CompoundLiveCollateralSnapshot[],
  existingDebt: RawAmount,
): { borrowLimitRaw: bigint; liquidationLimitRaw: bigint } {
  const grossBorrowRaw = collateral.reduce(
    (sum, item) =>
      sum +
      mulDivDown(
        BigInt(item.valueExact.raw),
        BigInt(item.borrowCollateralFactorExact.numerator),
        BigInt(item.borrowCollateralFactorExact.denominator),
      ),
    0n,
  );
  const liquidationLimitRaw = collateral.reduce(
    (sum, item) =>
      sum +
      mulDivDown(
        BigInt(item.valueExact.raw),
        BigInt(item.liquidateCollateralFactorExact.numerator),
        BigInt(item.liquidateCollateralFactorExact.denominator),
      ),
    0n,
  );
  const debtRaw = BigInt(existingDebt.raw);
  return {
    borrowLimitRaw: grossBorrowRaw > debtRaw ? grossBorrowRaw - debtRaw : 0n,
    liquidationLimitRaw,
  };
}

function sortLiveQuotes(
  a: ProtocolBorrowQuote,
  b: ProtocolBorrowQuote,
): number {
  const exactA = BigInt(a.exactMaximum.raw);
  const exactB = BigInt(b.exactMaximum.raw);
  if (exactA !== exactB) return exactB > exactA ? 1 : -1;

  return b.confidenceScore - a.confidenceScore;
}
