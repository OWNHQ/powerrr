import type {
  BorrowRouteLeg,
  PortfolioAsset,
  ProtocolAvailability,
  ProtocolBorrowQuote,
} from "@powerrr/shared-types";

export type EstimatorCapacitySummary = {
  providerMaximumUsd: number;
  providerPathCount: number;
};

export type CollateralCoverageSummary = {
  selectedValueUsd: number;
  modeledValueUsd: number | null;
  gapValueUsd: number | null;
  sourceStatus: "complete" | "partial" | "unavailable";
};

export type MarketSortDirection = "asc" | "desc";

export type MarketSortValue = {
  isAvailable: boolean;
  value: number | null;
  originalIndex: number;
};

type CoverageAsset = Pick<
  PortfolioAsset,
  "token" | "balance" | "marketPriceUsd"
>;
type CoverageQuote = Pick<
  ProtocolBorrowQuote,
  "assetEvaluations" | "collateralUsed"
>;
type CoverageStatus = Pick<ProtocolAvailability, "status">;

export function isAssetSelectable(
  asset: Pick<
    PortfolioAsset,
    "marketPriceUsd" | "priceStatus" | "valuationStatus"
  >,
): boolean {
  return (
    asset.valuationStatus === "available" &&
    asset.priceStatus !== "unavailable" &&
    typeof asset.marketPriceUsd === "number" &&
    Number.isFinite(asset.marketPriceUsd) &&
    asset.marketPriceUsd > 0
  );
}

export function summarizeEstimatorCapacity(
  providerCapacities: number[],
): EstimatorCapacitySummary {
  const usableProviderCapacities = providerCapacities.filter(
    (capacity) => Number.isFinite(capacity) && capacity > 0,
  );
  const providerMaximumUsd = Math.max(0, ...usableProviderCapacities);
  return {
    providerMaximumUsd,
    providerPathCount: usableProviderCapacities.length,
  };
}

export function compareMarketSortValues(
  left: MarketSortValue,
  right: MarketSortValue,
  direction: MarketSortDirection,
): number {
  if (left.isAvailable !== right.isAvailable) {
    return left.isAvailable ? -1 : 1;
  }

  const leftHasValue = left.value !== null && Number.isFinite(left.value);
  const rightHasValue = right.value !== null && Number.isFinite(right.value);
  if (leftHasValue !== rightHasValue) return leftHasValue ? -1 : 1;
  if (leftHasValue && rightHasValue && left.value !== right.value) {
    return direction === "asc"
      ? left.value! - right.value!
      : right.value! - left.value!;
  }
  return left.originalIndex - right.originalIndex;
}

export function summarizeCollateralCoverage(
  selectedAssets: CoverageAsset[],
  quotes: CoverageQuote[],
  providerStatuses: CoverageStatus[],
): CollateralCoverageSummary {
  const selectedValues = new Map<string, number>();
  for (const asset of selectedAssets) {
    const valueUsd = assetUsdValue(asset);
    if (valueUsd <= 0) continue;
    const token = asset.token.toLowerCase();
    selectedValues.set(
      token,
      Math.max(selectedValues.get(token) ?? 0, valueUsd),
    );
  }
  const selectedValueUsd = sumValues(selectedValues.values());
  const availableSourceCount = providerStatuses.filter(
    (status) => status.status === "available",
  ).length;

  if (availableSourceCount === 0 || quotes.length === 0) {
    return {
      selectedValueUsd,
      modeledValueUsd: null,
      gapValueUsd: null,
      sourceStatus: "unavailable",
    };
  }

  const modeledValues = new Map<string, number>();
  for (const quote of quotes) {
    if (quote.assetEvaluations) {
      for (const evaluation of quote.assetEvaluations) {
        if (
          evaluation.selectionStatus !== "not-selected" &&
          Number.isFinite(evaluation.contributionUsd) &&
          (evaluation.contributionUsd ?? 0) > 0
        ) {
          const token = evaluation.token.toLowerCase();
          modeledValues.set(
            token,
            Math.max(
              modeledValues.get(token) ?? 0,
              Math.min(
                selectedValues.get(token) ?? 0,
                evaluation.contributionUsd ?? 0,
              ),
            ),
          );
        }
      }
      continue;
    }
    for (const collateral of quote.collateralUsed) {
      if (Number.isFinite(collateral.valueUsd) && collateral.valueUsd > 0) {
        const token = collateral.token.toLowerCase();
        modeledValues.set(
          token,
          Math.max(
            modeledValues.get(token) ?? 0,
            Math.min(selectedValues.get(token) ?? 0, collateral.valueUsd),
          ),
        );
      }
    }
  }

  const modeledValueUsd = sumValues(modeledValues.values());
  return {
    selectedValueUsd,
    modeledValueUsd,
    gapValueUsd: roundUsd(Math.max(0, selectedValueUsd - modeledValueUsd)),
    sourceStatus: providerStatuses.some(
      (status) => status.status === "unavailable",
    )
      ? "partial"
      : "complete",
  };
}

export function providerRateLabel(
  quote: Pick<ProtocolBorrowQuote, "annualRate" | "indicativeApr" | "rateType">,
): string {
  const rate = quote.annualRate;
  const value = rate?.value ?? quote.indicativeApr;
  const formatted = formatAnnualRatePercent(value);
  return `${formatted} ${quote.rateType} ${(rate?.convention ?? "apr").toUpperCase()}`;
}

export function annualRateAsApr(
  value: number | null | undefined,
  convention: "apr" | "apy" = "apr",
): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  if (convention === "apr") return value;
  return value <= -1 ? null : Math.log1p(value);
}

export function providerBorrowApr(
  quote: Pick<ProtocolBorrowQuote, "annualRate" | "indicativeApr">,
): number | null {
  return annualRateAsApr(
    quote.annualRate?.value ?? quote.indicativeApr,
    quote.annualRate?.convention ?? "apr",
  );
}

export function weightedRouteBorrowApr(
  legs: ReadonlyArray<
    Pick<BorrowRouteLeg, "borrowAmount" | "currentBorrowApy">
  >,
): number | null {
  const borrowedRaw = legs.reduce(
    (sum, leg) => sum + BigInt(leg.borrowAmount.raw),
    0n,
  );
  if (borrowedRaw <= 0n) return null;

  return legs.reduce((weightedApr, leg) => {
    const apy =
      Number(leg.currentBorrowApy.numerator) /
      Number(leg.currentBorrowApy.denominator);
    const apr = annualRateAsApr(apy, "apy");
    if (apr === null) return weightedApr;
    const weight = Number(BigInt(leg.borrowAmount.raw)) / Number(borrowedRaw);
    return weightedApr + apr * weight;
  }, 0);
}

export function formatAnnualRatePercent(
  value: number | null | undefined,
): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "percent",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
}

export function amountForUtilization(
  maximumUsd: number,
  utilizationPercent: number,
): number {
  if (!Number.isFinite(maximumUsd) || maximumUsd <= 0) return 0;
  const percent = clamp(utilizationPercent, 0, 100);
  if (percent === 100) return maximumUsd;
  return roundAmount((maximumUsd * percent) / 100, maximumUsd);
}

export function amountForTargetLtv(
  collateralValueUsd: number,
  existingDebtUsd: number,
  targetLtvPercent: number,
): number {
  if (!Number.isFinite(collateralValueUsd) || collateralValueUsd <= 0) return 0;
  const targetLtv = clamp(targetLtvPercent, 0, 100) / 100;
  const startingDebt = Number.isFinite(existingDebtUsd)
    ? Math.max(0, existingDebtUsd)
    : 0;
  return roundAmount(
    Math.max(0, collateralValueUsd * targetLtv - startingDebt),
    collateralValueUsd,
  );
}

export function utilizationForAmount(
  maximumUsd: number,
  amountUsd: number,
): number {
  if (!Number.isFinite(maximumUsd) || maximumUsd <= 0) return 0;
  return clamp((amountUsd / maximumUsd) * 100, 0, 100);
}

export function amountInputStep(maximumUsd: number): number {
  if (maximumUsd < 1) return 0.000001;
  if (maximumUsd < 100) return 0.01;
  if (maximumUsd < 1_000) return 1;
  return 100;
}

export function sortAssetsByUsdValue<
  T extends { balance: string; marketPriceUsd?: number | null },
>(assets: T[]): T[] {
  return [...assets].sort(
    (left, right) => assetUsdValue(right) - assetUsdValue(left),
  );
}

export function filterSmallBalances<
  T extends { balance: string; marketPriceUsd?: number | null },
>(assets: T[], minimumUsd = 5): T[] {
  const positiveAssets = assets.filter((asset) => assetUsdValue(asset) > 0);
  const assetsAtOrAboveMinimum = positiveAssets.filter(
    (asset) => assetUsdValue(asset) >= minimumUsd,
  );

  return assetsAtOrAboveMinimum.length
    ? assetsAtOrAboveMinimum
    : positiveAssets;
}

export function formatUsdValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Unavailable";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function liquidationBufferDescription(
  healthFactor: number | null | undefined,
): string {
  if (
    healthFactor === null ||
    healthFactor === undefined ||
    !Number.isFinite(healthFactor) ||
    healthFactor <= 0
  ) {
    return "Available when this market can support the amount.";
  }

  if (healthFactor <= 1) {
    return "At or beyond the liquidation threshold.";
  }

  const dropPercent = (1 - 1 / healthFactor) * 100;
  const formattedDrop =
    dropPercent < 0.1
      ? "less than 0.1%"
      : `about ${new Intl.NumberFormat("en-US", {
          maximumFractionDigits: 1,
        }).format(dropPercent)}%`;
  return `Collateral value could fall ${formattedDrop} before liquidation.`;
}

export function minimumConstrainedMarketStatusLabel(
  requestedUsd: number,
  minimumBorrowUsd: number,
  protocolBorrowLimitUsd: number,
): string {
  const requested = Number.isFinite(requestedUsd)
    ? Math.max(0, requestedUsd)
    : 0;
  const minimum = Number.isFinite(minimumBorrowUsd)
    ? Math.max(0, minimumBorrowUsd)
    : 0;
  const protocolLimit = Number.isFinite(protocolBorrowLimitUsd)
    ? Math.max(0, protocolBorrowLimitUsd)
    : 0;

  if (requested >= minimum && requested > protocolLimit) {
    return `Short by ${formatUsdValue(requested - protocolLimit)}`;
  }

  return `Max below ${formatUsdValue(minimum)} minimum`;
}

function roundUsd(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function friendlyEstimatorError(error: unknown): string {
  const code = nestedString(error, ["data", "error", "code"]).toUpperCase();
  const message = (
    nestedString(error, ["data", "error", "message"]) ||
    (error instanceof Error ? error.message : "")
  ).toLowerCase();

  if (
    code.includes("ENS") ||
    message.includes("ens resolution") ||
    message.includes("resolvewithgateways") ||
    message.includes("could not resolve")
  ) {
    return "We couldn’t resolve that ENS name. Check the spelling or paste a 0x address.";
  }
  if (
    code.includes("INVALID") ||
    message.includes("invalid address") ||
    message.includes("invalid wallet")
  ) {
    return "That Ethereum address is not valid. Check it and try again.";
  }
  if (
    code.includes("RATE_LIMIT") ||
    message.includes("rate limit") ||
    message.includes("too many requests")
  ) {
    return "Too many estimates were requested in a short time. Wait a moment and try again.";
  }
  if (
    code.includes("PROTOCOL_SOURCE") ||
    message.includes("provider data") ||
    message.includes("public rpc") ||
    message.includes("service unavailable")
  ) {
    return "Live market data is temporarily unavailable. The address was not changed—try again shortly.";
  }

  return "We couldn’t estimate this address right now. Check it and try again.";
}

export function providerFreshnessLabel(quote: ProtocolBorrowQuote): string {
  if (
    quote.stale ||
    quote.provenance.some((item) => item.freshnessStatus === "stale")
  ) {
    return "Stale estimate";
  }
  if (quote.provenance.some((item) => item.sourceType === "assumption")) {
    return "Includes assumptions";
  }
  if (quote.provenance.every((item) => item.sourceType === "fixture")) {
    return "Demo data";
  }

  const oldestSourceSeconds = quote.provenance.reduce<number | null>(
    (oldest, item) => {
      if (item.freshnessSeconds === undefined) return oldest;
      return oldest === null
        ? item.freshnessSeconds
        : Math.max(oldest, item.freshnessSeconds);
    },
    null,
  );

  if (oldestSourceSeconds === null) {
    return "Freshness unknown";
  }
  if (oldestSourceSeconds === 0) {
    return "Current block";
  }
  if (oldestSourceSeconds < 60) {
    return `${oldestSourceSeconds}s old`;
  }
  return `${Math.round(oldestSourceSeconds / 60)}m old`;
}

function nestedString(value: unknown, path: string[]): string {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) return "";
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : "";
}

function assetUsdValue(asset: {
  balance: string;
  marketPriceUsd?: number | null;
}): number {
  const balance = Number(asset.balance);
  return Number.isFinite(balance) && asset.marketPriceUsd
    ? balance * asset.marketPriceUsd
    : 0;
}

function sumValues(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

function roundAmount(value: number, maximumUsd: number): number {
  const precision = maximumUsd < 1 ? 1_000_000 : maximumUsd < 100 ? 100 : 1;
  return Math.round(value * precision) / precision;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
