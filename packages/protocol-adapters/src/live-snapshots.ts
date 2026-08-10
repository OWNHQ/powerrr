import {
  calculateAaveLikeBorrow,
  calculateCompoundBorrow,
  calculateConfidenceScore,
  riskLevelFromHealthFactor,
  roundUsd,
  safetyBufferForProfile,
  minBigInt,
  mulDivDown,
  mulDivUp,
  rawAmount,
  rawRatio,
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
  BorrowRouteLeg,
  IsolatedBorrowRoute,
  IsolatedMarketCapacity,
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
  collateralAvailableExact: RawAmount;
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
                  collateralAvailableExact: rawAmount(
                    market.rawCollateral.sources
                      .filter((source) =>
                        selected.has(source.token.toLowerCase()),
                      )
                      .reduce(
                        (sum, source) =>
                          sum + BigInt(source.convertedBalanceRaw),
                        0n,
                      ),
                    market.rawCollateral.protocolDecimals,
                  ),
                  rawCollateral: {
                    ...market.rawCollateral,
                    sources: market.rawCollateral.sources.filter((source) =>
                      selected.has(source.token.toLowerCase()),
                    ),
                  },
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

export function buildMorphoBorrowRoute(
  candidates: IsolatedMarketCapacity[],
  requestedBorrowRaw: bigint,
  objective: "rate" | "capacity" = "rate",
): IsolatedBorrowRoute {
  const usable = candidates.filter(
    (candidate) =>
      BigInt(candidate.collateralAvailable.raw) > 0n &&
      BigInt(candidate.availableLiquidity.raw) > 0n &&
      BigInt(candidate.oraclePrice.numerator) > 0n &&
      BigInt(candidate.lltv.numerator) > 0n,
  );
  const remainingCollateral = new Map<string, bigint>();
  const remainingLiquidity = new Map<string, bigint>();
  for (const candidate of usable) {
    const key = candidate.collateralToken.toLowerCase();
    const available = BigInt(candidate.collateralAvailable.raw);
    remainingCollateral.set(
      key,
      available > (remainingCollateral.get(key) ?? 0n)
        ? available
        : (remainingCollateral.get(key) ?? 0n),
    );
    remainingLiquidity.set(
      candidate.marketId,
      BigInt(candidate.availableLiquidity.raw),
    );
  }
  const totalCollateral = new Map(remainingCollateral);

  const maximum = maximumMorphoAllocation(
    usable,
    remainingCollateral,
    remainingLiquidity,
  );
  const maximumRaw = maximum.reduce(
    (sum, leg) => sum + BigInt(leg.borrowAmount.raw),
    0n,
  );
  const targetRaw =
    objective === "capacity"
      ? maximumRaw
      : requestedBorrowRaw < maximumRaw
        ? requestedBorrowRaw
        : maximumRaw;
  let legs: BorrowRouteLeg[];

  if (objective === "capacity") {
    legs = maximum;
  } else {
    const targetHealthRaw = maximumCommonRouteHealth(
      usable,
      totalCollateral,
      remainingLiquidity,
      targetRaw,
    );
    legs = trimAllocationToTarget(
      usable,
      maximumMorphoAllocationAtHealth(
        usable,
        totalCollateral,
        remainingLiquidity,
        targetHealthRaw,
      ),
      targetRaw,
      targetHealthRaw,
    );
  }

  legs = equalizeRouteHealthFactors(legs, usable, totalCollateral);
  legs.sort(compareRouteBorrowAmount);

  const routedRaw = legs.reduce(
    (sum, leg) => sum + BigInt(leg.borrowAmount.raw),
    0n,
  );
  const collateralValueRaw = legs.reduce(
    (sum, leg) => sum + BigInt(leg.collateralValue.raw),
    0n,
  );
  const weightedLltvNumerator = legs.reduce(
    (sum, leg) =>
      sum +
      mulDivDown(
        BigInt(leg.collateralValue.raw),
        BigInt(leg.lltv.numerator),
        BigInt(leg.lltv.denominator),
      ),
    0n,
  );
  const lltvs = legs.map((leg) => ratioToNumber(leg.lltv));
  const healthFactors = legs
    .map((leg) => leg.healthFactor)
    .filter((value): value is number => value !== null);

  return {
    requestedBorrow: rawAmount(requestedBorrowRaw, USDC_DECIMALS),
    legs,
    weightedCurrentApy: weightedRouteApy(legs),
    effectiveLltv:
      collateralValueRaw > 0n
        ? Number(weightedLltvNumerator) / Number(collateralValueRaw)
        : null,
    lltvMinimum: lltvs.length ? Math.min(...lltvs) : null,
    lltvMaximum: lltvs.length ? Math.max(...lltvs) : null,
    worstHealthFactor: healthFactors.length ? Math.min(...healthFactors) : null,
    feasible:
      requestedBorrowRaw <= maximumRaw && routedRaw >= requestedBorrowRaw,
  };
}

const ROUTE_HEALTH_SCALE = 10n ** 18n;

function maximumCommonRouteHealth(
  candidates: IsolatedMarketCapacity[],
  collateral: Map<string, bigint>,
  liquidity: Map<string, bigint>,
  targetRaw: bigint,
): bigint {
  if (targetRaw <= 0n) return 0n;
  const capacityAt = (healthRaw: bigint) =>
    maximumMorphoAllocationAtHealth(
      candidates,
      collateral,
      liquidity,
      healthRaw,
    ).reduce((sum, leg) => sum + BigInt(leg.borrowAmount.raw), 0n);

  let low = ROUTE_HEALTH_SCALE;
  let high = ROUTE_HEALTH_SCALE;
  while (capacityAt(high) >= targetRaw) {
    low = high;
    high *= 2n;
  }
  while (low + 1n < high) {
    const midpoint = (low + high) / 2n;
    if (capacityAt(midpoint) >= targetRaw) low = midpoint;
    else high = midpoint;
  }
  return low;
}

function trimAllocationToTarget(
  candidates: IsolatedMarketCapacity[],
  allocation: BorrowRouteLeg[],
  targetRaw: bigint,
  healthRaw: bigint,
): BorrowRouteLeg[] {
  if (targetRaw <= 0n || healthRaw <= 0n) return [];
  const candidateByMarket = new Map(
    candidates.map((candidate) => [candidate.marketId, candidate]),
  );
  let excess = allocation.reduce(
    (sum, leg) => sum + BigInt(leg.borrowAmount.raw),
    -targetRaw,
  );
  const trimmed = [...allocation].sort((left, right) => {
    const leftCandidate = candidateByMarket.get(left.marketId);
    const rightCandidate = candidateByMarket.get(right.marketId);
    if (leftCandidate && rightCandidate) {
      const rateComparison = compareRatios(
        rightCandidate.currentBorrowApy,
        leftCandidate.currentBorrowApy,
      );
      if (rateComparison !== 0) return rateComparison;
    }
    return right.marketId.localeCompare(left.marketId);
  });

  return trimmed
    .map((leg) => {
      const candidate = candidateByMarket.get(leg.marketId);
      if (!candidate) return null;
      const borrowRaw = BigInt(leg.borrowAmount.raw);
      const reduction = minBigInt(excess > 0n ? excess : 0n, borrowRaw);
      const nextBorrowRaw = borrowRaw - reduction;
      excess -= reduction;
      if (nextBorrowRaw <= 0n) return null;
      return routeLeg(
        candidate,
        collateralForBorrowAtHealth(candidate, nextBorrowRaw, healthRaw),
        nextBorrowRaw,
      );
    })
    .filter((leg): leg is BorrowRouteLeg => leg !== null);
}

function equalizeRouteHealthFactors(
  legs: BorrowRouteLeg[],
  candidates: IsolatedMarketCapacity[],
  totalCollateral: Map<string, bigint>,
): BorrowRouteLeg[] {
  if (!legs.length) return [];
  const candidateByMarket = new Map(
    candidates.map((candidate) => [candidate.marketId, candidate]),
  );
  const healthScale = 10n ** 18n;

  const assignedAtHealth = (healthRaw: bigint): bigint[] | null => {
    const assigned = legs.map((leg) => {
      const candidate = candidateByMarket.get(leg.marketId);
      if (!candidate) return null;
      const borrowLimitRaw = mulDivUp(
        BigInt(leg.borrowAmount.raw),
        healthRaw,
        healthScale,
      );
      return collateralForBorrowLimit(candidate, borrowLimitRaw);
    });
    if (assigned.some((value) => value === null)) return null;

    const usedByCollateral = new Map<string, bigint>();
    assigned.forEach((value, index) => {
      const key = legs[index]!.collateralToken.toLowerCase();
      usedByCollateral.set(key, (usedByCollateral.get(key) ?? 0n) + value!);
    });
    for (const [token, usedRaw] of usedByCollateral) {
      if (usedRaw > (totalCollateral.get(token) ?? 0n)) return null;
    }
    return assigned as bigint[];
  };

  let low = 0n;
  let high = healthScale;
  while (assignedAtHealth(high) !== null) high *= 2n;
  while (low + 1n < high) {
    const midpoint = (low + high) / 2n;
    if (assignedAtHealth(midpoint) !== null) low = midpoint;
    else high = midpoint;
  }

  const assigned = assignedAtHealth(low);
  if (!assigned) return legs;
  return legs.map((leg, index) => {
    const candidate = candidateByMarket.get(leg.marketId);
    return candidate
      ? routeLeg(candidate, assigned[index]!, BigInt(leg.borrowAmount.raw))
      : leg;
  });
}

function isolatedMarketCapacityFromSnapshot(
  market: MorphoLiveMarketSnapshot,
): IsolatedMarketCapacity {
  return {
    marketId: market.marketId,
    collateralToken: market.collateralToken,
    collateralSymbol: market.rawCollateral.protocolSymbol,
    collateralAvailable: market.collateralAvailableExact,
    collateralSources: market.rawCollateral.sources.map((source) => ({
      token: source.token,
      symbol: source.symbol,
      convertedBalance: rawAmount(
        BigInt(source.convertedBalanceRaw),
        market.rawCollateral.protocolDecimals,
      ),
    })),
    oraclePrice: rawRatio(
      BigInt(market.rawCollateral.priceRaw) *
        BigInt(market.rawCollateral.valueNumeratorScale),
      BigInt(market.rawCollateral.valueDenominator),
    ),
    lltv: market.rawCollateral.ltv,
    availableLiquidity: market.availableLiquidityExact,
    currentBorrowApy: rawRatio(
      compoundedAnnualRateRaw(market.borrowRatePerSecond),
      10n ** 18n,
    ),
  };
}

function maximumMorphoAllocation(
  candidates: IsolatedMarketCapacity[],
  sourceCollateral: Map<string, bigint>,
  sourceLiquidity: Map<string, bigint>,
): BorrowRouteLeg[] {
  const collateral = new Map(sourceCollateral);
  const liquidity = new Map(sourceLiquidity);
  const legs: BorrowRouteLeg[] = [];
  const ordered = [...candidates].sort(compareMarketCapacityPriority);
  for (const candidate of ordered) {
    const key = candidate.collateralToken.toLowerCase();
    const collateralRaw = collateral.get(key) ?? 0n;
    const liquidityRaw = liquidity.get(candidate.marketId) ?? 0n;
    const capacityRaw = marketBorrowCapacity(
      candidate,
      collateralRaw,
      liquidityRaw,
    );
    if (capacityRaw <= 0n) continue;
    const assignedRaw = minBigInt(
      collateralRaw,
      collateralForBorrow(candidate, capacityRaw),
    );
    legs.push(routeLeg(candidate, assignedRaw, capacityRaw));
    collateral.set(key, collateralRaw - assignedRaw);
    liquidity.set(candidate.marketId, liquidityRaw - capacityRaw);
  }
  return legs;
}

function maximumMorphoAllocationAtHealth(
  candidates: IsolatedMarketCapacity[],
  sourceCollateral: Map<string, bigint>,
  sourceLiquidity: Map<string, bigint>,
  healthRaw: bigint,
): BorrowRouteLeg[] {
  const collateral = new Map(sourceCollateral);
  const liquidity = new Map(sourceLiquidity);
  const legs: BorrowRouteLeg[] = [];
  const ordered = [...candidates].sort(compareMarketCapacityPriority);
  for (const candidate of ordered) {
    const key = candidate.collateralToken.toLowerCase();
    const collateralRaw = collateral.get(key) ?? 0n;
    const liquidityRaw = liquidity.get(candidate.marketId) ?? 0n;
    const capacityRaw = marketBorrowCapacityAtHealth(
      candidate,
      collateralRaw,
      liquidityRaw,
      healthRaw,
    );
    if (capacityRaw <= 0n) continue;
    const assignedRaw = minBigInt(
      collateralRaw,
      collateralForBorrowAtHealth(candidate, capacityRaw, healthRaw),
    );
    legs.push(routeLeg(candidate, assignedRaw, capacityRaw));
    collateral.set(key, collateralRaw - assignedRaw);
    liquidity.set(candidate.marketId, liquidityRaw - capacityRaw);
  }
  return legs;
}

function marketBorrowCapacity(
  candidate: IsolatedMarketCapacity,
  collateralRaw: bigint,
  liquidityRaw: bigint,
): bigint {
  const collateralValueRaw = mulDivDown(
    collateralRaw,
    BigInt(candidate.oraclePrice.numerator),
    BigInt(candidate.oraclePrice.denominator),
  );
  return minBigInt(
    mulDivDown(
      collateralValueRaw,
      BigInt(candidate.lltv.numerator),
      BigInt(candidate.lltv.denominator),
    ),
    liquidityRaw,
  );
}

function marketBorrowCapacityAtHealth(
  candidate: IsolatedMarketCapacity,
  collateralRaw: bigint,
  liquidityRaw: bigint,
  healthRaw: bigint,
): bigint {
  if (healthRaw <= 0n) return 0n;
  return minBigInt(
    mulDivDown(
      marketBorrowCapacity(candidate, collateralRaw, 2n ** 255n),
      ROUTE_HEALTH_SCALE,
      healthRaw,
    ),
    liquidityRaw,
  );
}

function collateralForBorrow(
  candidate: IsolatedMarketCapacity,
  borrowRaw: bigint,
): bigint {
  return collateralForBorrowLimit(candidate, borrowRaw);
}

function collateralForBorrowAtHealth(
  candidate: IsolatedMarketCapacity,
  borrowRaw: bigint,
  healthRaw: bigint,
): bigint {
  return collateralForBorrowLimit(
    candidate,
    mulDivUp(borrowRaw, healthRaw, ROUTE_HEALTH_SCALE),
  );
}

function collateralForBorrowLimit(
  candidate: IsolatedMarketCapacity,
  borrowLimitRaw: bigint,
): bigint {
  const collateralValueRaw = mulDivUp(
    borrowLimitRaw,
    BigInt(candidate.lltv.denominator),
    BigInt(candidate.lltv.numerator),
  );
  return mulDivUp(
    collateralValueRaw,
    BigInt(candidate.oraclePrice.denominator),
    BigInt(candidate.oraclePrice.numerator),
  );
}

function routeLeg(
  candidate: IsolatedMarketCapacity,
  collateralRaw: bigint,
  borrowRaw: bigint,
): BorrowRouteLeg {
  const collateralValueRaw = mulDivDown(
    collateralRaw,
    BigInt(candidate.oraclePrice.numerator),
    BigInt(candidate.oraclePrice.denominator),
  );
  const borrowLimitRaw = mulDivDown(
    collateralValueRaw,
    BigInt(candidate.lltv.numerator),
    BigInt(candidate.lltv.denominator),
  );
  return {
    marketId: candidate.marketId,
    collateralToken: candidate.collateralToken,
    collateralSymbol: candidate.collateralSymbol,
    collateralAssigned: rawAmount(
      collateralRaw,
      candidate.collateralAvailable.decimals,
    ),
    collateralValue: rawAmount(collateralValueRaw, USDC_DECIMALS),
    borrowAmount: rawAmount(borrowRaw, USDC_DECIMALS),
    currentBorrowApy: candidate.currentBorrowApy,
    lltv: candidate.lltv,
    availableLiquidity: candidate.availableLiquidity,
    healthFactor:
      borrowRaw > 0n ? Number(borrowLimitRaw) / Number(borrowRaw) : null,
  };
}

function compareMarketCapacityPriority(
  left: IsolatedMarketCapacity,
  right: IsolatedMarketCapacity,
): number {
  const lltvComparison = compareRatios(right.lltv, left.lltv);
  if (lltvComparison !== 0) return lltvComparison;
  const liquidityComparison =
    BigInt(right.availableLiquidity.raw) - BigInt(left.availableLiquidity.raw);
  if (liquidityComparison !== 0n) return liquidityComparison > 0n ? 1 : -1;
  return left.marketId.localeCompare(right.marketId);
}

function compareRouteBorrowAmount(
  left: BorrowRouteLeg,
  right: BorrowRouteLeg,
): number {
  const difference =
    BigInt(right.borrowAmount.raw) - BigInt(left.borrowAmount.raw);
  if (difference !== 0n) return difference > 0n ? 1 : -1;
  return left.marketId.localeCompare(right.marketId);
}

function compareRatios(left: RawRatio, right: RawRatio): number {
  const leftScaled = BigInt(left.numerator) * BigInt(right.denominator);
  const rightScaled = BigInt(right.numerator) * BigInt(left.denominator);
  return leftScaled < rightScaled ? -1 : leftScaled > rightScaled ? 1 : 0;
}

function weightedRouteApy(legs: BorrowRouteLeg[]): number | null {
  const borrowedRaw = legs.reduce(
    (sum, leg) => sum + BigInt(leg.borrowAmount.raw),
    0n,
  );
  if (borrowedRaw <= 0n) return null;
  const weightedWad = legs.reduce(
    (sum, leg) =>
      sum +
      mulDivDown(
        BigInt(leg.borrowAmount.raw),
        BigInt(leg.currentBorrowApy.numerator),
        BigInt(leg.currentBorrowApy.denominator),
      ),
    0n,
  );
  return Number(weightedWad) / Number(borrowedRaw);
}

function morphoAssetEvaluations(
  input: MorphoLiveSnapshot,
  legs: BorrowRouteLeg[],
): ProtocolAssetEvaluation[] | undefined {
  if (!input.assetEvaluations) return undefined;
  const contributions = new Map<string, bigint>();
  const protocolTokens = new Set(
    legs.map((leg) => leg.collateralToken.toLowerCase()),
  );
  for (const protocolToken of protocolTokens) {
    const market = input.markets.find(
      (candidate) => candidate.collateralToken.toLowerCase() === protocolToken,
    );
    if (!market) continue;
    const sources = market.rawCollateral.sources;
    const totalBalanceRaw = sources.reduce(
      (sum, source) => sum + BigInt(source.convertedBalanceRaw),
      0n,
    );
    const totalValueRaw = legs
      .filter((leg) => leg.collateralToken.toLowerCase() === protocolToken)
      .reduce((sum, leg) => sum + BigInt(leg.collateralValue.raw), 0n);
    if (totalBalanceRaw <= 0n || totalValueRaw <= 0n) continue;
    let allocated = 0n;
    sources.forEach((source, index) => {
      const contribution =
        index === sources.length - 1
          ? totalValueRaw - allocated
          : mulDivDown(
              totalValueRaw,
              BigInt(source.convertedBalanceRaw),
              totalBalanceRaw,
            );
      allocated += contribution;
      const key = source.token.toLowerCase();
      contributions.set(key, (contributions.get(key) ?? 0n) + contribution);
    });
  }
  return input.assetEvaluations.map((evaluation) => {
    const { contributionUsd: _previousContribution, ...base } = evaluation;
    const contribution = contributions.get(evaluation.token.toLowerCase());
    return contribution && contribution > 0n
      ? {
          ...base,
          contributionUsd: rawAmountToNumber(
            rawAmount(contribution, USDC_DECIMALS),
          ),
        }
      : base;
  });
}

export function quoteMorphoLiveSnapshot(
  input: MorphoLiveSnapshot,
): ProtocolBorrowQuote {
  const candidates = input.markets.map(isolatedMarketCapacityFromSnapshot);
  const maximumRoute = buildMorphoBorrowRoute(
    candidates,
    candidates.reduce(
      (sum, candidate) => sum + BigInt(candidate.availableLiquidity.raw),
      0n,
    ),
    "capacity",
  );
  const exactBorrowLimitRaw = maximumRoute.legs.reduce(
    (sum, leg) => sum + BigInt(leg.borrowAmount.raw),
    0n,
  );

  if (!maximumRoute.legs.length) {
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
      isolatedMarketCapacities: candidates,
      maximumBorrowRoute: [],
    });
  }

  const weightedApy = weightedRouteApy(maximumRoute.legs);
  const assetEvaluations = morphoAssetEvaluations(input, maximumRoute.legs);
  const collateralUsed = maximumRoute.legs.map((leg) => ({
    token: leg.collateralToken,
    symbol: leg.collateralSymbol,
    valueUsd: rawAmountToNumber(leg.collateralValue),
    valueExact: leg.collateralValue,
    ltv: ratioToNumber(leg.lltv),
    liquidationThreshold: ratioToNumber(leg.lltv),
    ltvExact: leg.lltv,
    liquidationThresholdExact: leg.lltv,
    marketId: leg.marketId,
  }));
  const safetyAdjustedRaw = mulDivDown(
    exactBorrowLimitRaw,
    BigInt(Math.round(safetyBufferForProfile(input.safetyProfile) * 100)),
    100n,
  );
  const { annualRateExact: _previousAnnualRateExact, ...morphoInput } = input;

  return buildLiveQuote({
    input: {
      ...morphoInput,
      ...(assetEvaluations ? { assetEvaluations } : {}),
      indicativeApr: null,
      annualRateValue: weightedApy,
      annualRateTransform: "ratio",
      annualRateConvention: "apy",
      rateSourceId: "morpho-blue:weighted-current-route",
      assumptions: [
        ...(input.assumptions ?? []),
        "Aggregate capacity allocates each collateral family once across independent markets.",
      ],
    },
    theoreticalBorrowUsd: rawAmountToNumber(
      rawAmount(exactBorrowLimitRaw, USDC_DECIMALS),
    ),
    safeBorrowUsd: rawAmountToNumber(
      rawAmount(safetyAdjustedRaw, USDC_DECIMALS),
    ),
    liquidationRisk: "ltv-threshold",
    collateralUsed,
    healthFactor: null,
    warnings: input.warnings ?? [],
    exactProtocolBorrowLimitRaw: exactBorrowLimitRaw,
    exactRecommendedMaximumRaw: safetyAdjustedRaw,
    isolatedMarketCapacities: candidates,
    maximumBorrowRoute: maximumRoute.legs,
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
  isolatedMarketCapacities?: IsolatedMarketCapacity[];
  maximumBorrowRoute?: BorrowRouteLeg[];
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
    ...(input.isolatedMarketCapacities
      ? { isolatedMarketCapacities: input.isolatedMarketCapacities }
      : {}),
    ...(input.maximumBorrowRoute
      ? { maximumBorrowRoute: input.maximumBorrowRoute }
      : {}),
  };
}

function exactAnnualRateValue(input: LiveProtocolSnapshot): number | null {
  if (input.annualRateExact) {
    if (input.annualRateTransform === "per-second-apy") {
      return compoundedAnnualRate(input.annualRateExact);
    }
    return ratioToNumber(input.annualRateExact);
  }
  return input.annualRateValue ?? input.indicativeApr ?? null;
}

function compoundedAnnualRate(ratePerSecond: RawRatio): number {
  return (
    Number(compoundedAnnualRateRaw(ratePerSecond)) /
    Number(BigInt(ratePerSecond.denominator))
  );
}

function compoundedAnnualRateRaw(ratePerSecond: RawRatio): bigint {
  const numerator = BigInt(ratePerSecond.numerator);
  const denominator = BigInt(ratePerSecond.denominator);
  const firstTerm = numerator * 31_536_000n;
  const secondTerm = (firstTerm * firstTerm) / (2n * denominator);
  const thirdTerm = (secondTerm * firstTerm) / (3n * denominator);
  return firstTerm + secondTerm + thirdTerm;
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
