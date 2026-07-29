import type {
  BorrowOpportunity,
  ProtocolBorrowQuote,
} from "@powerrr/shared-types";

export type EstimatorCapacitySummary = {
  providerMaximumUsd: number;
  ownPotentialUsd: number;
  maximumRequestableUsd: number;
  providerPathCount: number;
};

export function summarizeEstimatorCapacity(
  providerCapacities: number[],
  ownPotentialUsd: number,
): EstimatorCapacitySummary {
  const usableProviderCapacities = providerCapacities.filter(
    (capacity) => Number.isFinite(capacity) && capacity > 0,
  );
  const providerMaximumUsd = Math.max(0, ...usableProviderCapacities);
  const normalizedOwnPotentialUsd =
    Number.isFinite(ownPotentialUsd) && ownPotentialUsd > 0
      ? ownPotentialUsd
      : 0;

  return {
    providerMaximumUsd,
    ownPotentialUsd: normalizedOwnPotentialUsd,
    maximumRequestableUsd: Math.max(
      providerMaximumUsd,
      normalizedOwnPotentialUsd,
    ),
    providerPathCount: usableProviderCapacities.length,
  };
}

export function ownFundingStatusLabel(
  status: BorrowOpportunity["fundingStatus"] | undefined,
): string {
  switch (status) {
    case "available-now":
      return "Funding available";
    case "limited":
      return "Limited availability";
    case "request-required":
      return "Request required";
    default:
      return "Unavailable";
  }
}

export function ownSupportsRequestedAmount(
  potentialBorrowUsd: number,
  requestedAmountUsd: number,
): boolean {
  return (
    Number.isFinite(potentialBorrowUsd) &&
    potentialBorrowUsd > 0 &&
    Number.isFinite(requestedAmountUsd) &&
    requestedAmountUsd > 0 &&
    potentialBorrowUsd >= requestedAmountUsd
  );
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

function roundAmount(value: number, maximumUsd: number): number {
  const precision = maximumUsd < 1 ? 1_000_000 : maximumUsd < 100 ? 100 : 1;
  return Math.round(value * precision) / precision;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
