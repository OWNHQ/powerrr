import type {
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

  const modeledTokens = new Set<string>();
  for (const quote of quotes) {
    if (quote.assetEvaluations) {
      for (const evaluation of quote.assetEvaluations) {
        if (
          evaluation.selectionStatus !== "not-selected" &&
          Number.isFinite(evaluation.contributionUsd) &&
          (evaluation.contributionUsd ?? 0) > 0
        ) {
          modeledTokens.add(evaluation.token.toLowerCase());
        }
      }
      continue;
    }
    for (const collateral of quote.collateralUsed) {
      if (Number.isFinite(collateral.valueUsd) && collateral.valueUsd > 0) {
        modeledTokens.add(collateral.token.toLowerCase());
      }
    }
  }

  const modeledValueUsd = sumValues(
    [...modeledTokens].map((token) => selectedValues.get(token) ?? 0),
  );
  return {
    selectedValueUsd,
    modeledValueUsd,
    gapValueUsd: Math.max(0, selectedValueUsd - modeledValueUsd),
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
  const formatted =
    value === null || value === undefined || !Number.isFinite(value)
      ? "—"
      : new Intl.NumberFormat("en-US", {
          style: "percent",
          maximumFractionDigits: 1,
        }).format(value);
  return `${formatted} ${quote.rateType} ${(rate?.convention ?? "apr").toUpperCase()}`;
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
  const minimumFractionDigits =
    value > 0 && value < 0.01
      ? 4
      : value > 0 && value < 1
        ? 2
        : value > 0 && value < 100
          ? 2
          : 0;
  const maximumFractionDigits =
    value > 0 && value < 0.01
      ? 6
      : value > 0 && value < 1
        ? 4
        : value > 0 && value < 100
          ? 2
          : 0;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value);
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
    return "Live provider data is temporarily unavailable. The address was not changed—try again shortly.";
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
