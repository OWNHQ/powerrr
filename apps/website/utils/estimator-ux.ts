import type { ProtocolBorrowQuote } from "@powerrr/shared-types";

export type ProviderCandidate = {
  id: string;
  capacityUsd: number;
};

export function chooseDefaultProviderId(input: {
  ownPotentialUsd: number;
  ownLeadEnabled: boolean;
  providers: ProviderCandidate[];
}): string {
  if (input.ownLeadEnabled && input.ownPotentialUsd > 0) {
    return "own";
  }

  return (
    [...input.providers]
      .filter((provider) => provider.capacityUsd > 0)
      .sort((a, b) => b.capacityUsd - a.capacityUsd)[0]?.id ?? ""
  );
}

export function amountForUtilization(
  maximumUsd: number,
  utilizationPercent: number,
): number {
  if (!Number.isFinite(maximumUsd) || maximumUsd <= 0) return 0;
  const percent = clamp(utilizationPercent, 0, 100);
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
  if (value > 0 && value < 0.01) {
    return "<$0.01";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value > 0 && value < 100 ? 2 : 0,
    maximumFractionDigits: value > 0 && value < 100 ? 2 : 0,
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
    return "We couldn’t resolve that ENS name. Check the spelling or paste a 0x wallet address.";
  }
  if (
    code.includes("INVALID") ||
    message.includes("invalid address") ||
    message.includes("invalid wallet")
  ) {
    return "That wallet address is not valid. Check it and try again.";
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
    return "Live provider data is temporarily unavailable. Your wallet was not changed—try again shortly.";
  }

  return "We couldn’t estimate this wallet right now. Check the address and try again.";
}

export function providerAvailabilityMessage(
  reason: string | undefined,
): string {
  const normalized = reason?.toLowerCase() ?? "";
  if (
    normalized.includes("source") ||
    normalized.includes("rpc") ||
    normalized.includes("read failed") ||
    normalized.includes("timeout")
  ) {
    return "Live estimate temporarily unavailable";
  }
  return reason?.trim() || "No eligible collateral";
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
  const precision = maximumUsd < 100 ? 100 : 1;
  return Math.round(value * precision) / precision;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
