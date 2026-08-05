import type {
  ProtocolBorrowQuote,
  WebsiteQuoteRow,
} from "@powerrr/shared-types";
import { compareRawAmounts } from "@powerrr/math";

export type WebsiteQuoteGroupRow = WebsiteQuoteRow & {
  groupId: string;
  groupLabel: string;
  primaryProtocolId: string;
  protocolIds: string[];
  protocolsLabel: string;
  quoteCount: number;
};

export type WebsiteQuoteGroup = {
  groupId: string;
  groupLabel: string;
  primaryQuote: ProtocolBorrowQuote;
  quotes: ProtocolBorrowQuote[];
  row: WebsiteQuoteGroupRow;
};

export function toWebsiteQuoteRow(quote: ProtocolBorrowQuote): WebsiteQuoteRow {
  const eligibleCollateralUsd = quote.collateralUsed.reduce(
    (sum, item) => sum + item.valueUsd,
    0,
  );

  return {
    protocolId: quote.protocolId,
    protocolLabel: quote.protocolLabel,
    amountDisplay: formatUsdForRow(quote.safeBorrowUsd),
    theoreticalBorrowUsd: quote.theoreticalBorrowUsd,
    safeBorrowUsd: quote.safeBorrowUsd,
    targetBorrowAsset: quote.targetBorrowAsset,
    eligibleCollateralDisplay: collateralDisplay(quote),
    eligibleCollateralUsd,
    rateType: quote.rateType,
    indicativeApr: quote.indicativeApr ?? null,
    termLabel: termLabel(quote),
    liquidationRiskLabel: quote.liquidationRisk.replaceAll("-", " "),
    riskLevel: quote.riskLevel,
    confidence: quote.confidence,
    confidenceLabel: `${quote.confidence} · ${quote.confidenceScore}`,
    freshnessLabel: freshnessLabel(quote),
    availableLiquidityUsd: quote.availableLiquidityUsd ?? null,
    cta: {
      label: "Inspect",
      action: "open-drawer",
    },
  };
}

export function groupWebsiteQuoteRows(
  quotes: ProtocolBorrowQuote[],
): WebsiteQuoteGroup[] {
  const groups = new Map<string, ProtocolBorrowQuote[]>();

  for (const quote of quotes) {
    const current = groups.get(quote.familyId) ?? [];
    current.push(quote);
    groups.set(quote.familyId, current);
  }

  return [...groups.entries()]
    .map(([groupId, groupQuotes]) => {
      const sortedQuotes = [...groupQuotes].sort(sortQuotesForDisplay);
      const primaryQuote = sortedQuotes[0];

      if (!primaryQuote) {
        throw new Error(
          `Quote group ${groupId} did not include a primary quote`,
        );
      }

      const primaryRow = toWebsiteQuoteRow(primaryQuote);
      const row: WebsiteQuoteGroupRow = {
        ...primaryRow,
        protocolId: primaryQuote.familyId,
        protocolLabel: primaryQuote.familyLabel,
        groupId: primaryQuote.familyId,
        groupLabel: primaryQuote.familyLabel,
        primaryProtocolId: primaryQuote.protocolId,
        protocolIds: sortedQuotes.map((quote) => quote.protocolId),
        protocolsLabel: sortedQuotes
          .map((quote) => quote.protocolLabel)
          .join(", "),
        quoteCount: sortedQuotes.length,
        cta: {
          label: sortedQuotes.length > 1 ? "Compare" : primaryRow.cta.label,
          action: primaryRow.cta.action,
        },
      };

      return {
        groupId: primaryQuote.familyId,
        groupLabel: primaryQuote.familyLabel,
        primaryQuote,
        quotes: sortedQuotes,
        row,
      };
    })
    .sort((a, b) => {
      const exact = compareRawAmounts(
        b.primaryQuote.exactMaximum,
        a.primaryQuote.exactMaximum,
      );
      return exact || sortRowsForDisplay(a.row, b.row);
    });
}

export function termLabel(
  quote: Pick<ProtocolBorrowQuote, "termMonths">,
): string {
  return quote.termMonths ? `${quote.termMonths} month` : "Open-ended";
}

export function freshnessLabel(
  quote: Pick<ProtocolBorrowQuote, "stale" | "provenance">,
): string {
  if (quote.stale) {
    return "Stale";
  }

  if (quote.provenance.some((item) => item.sourceType === "assumption")) {
    return "Assumption";
  }

  if (quote.provenance.every((item) => item.sourceType === "fixture")) {
    return "Demo data";
  }

  const freshest = quote.provenance.reduce<number | null>((max, item) => {
    if (item.freshnessSeconds === undefined) {
      return max;
    }

    return max === null
      ? item.freshnessSeconds
      : Math.max(max, item.freshnessSeconds);
  }, null);

  if (freshest === null) {
    return "Unknown";
  }

  if (freshest === 0) {
    return "Live block";
  }

  return `${freshest}s old`;
}

export function collateralDisplay(
  quote: Pick<ProtocolBorrowQuote, "collateralUsed">,
): string {
  if (!quote.collateralUsed.length) {
    return "None";
  }

  const symbols = [...new Set(quote.collateralUsed.map((item) => item.symbol))];
  if (symbols.length <= 2) {
    return symbols.join(", ");
  }

  return `${symbols.slice(0, 2).join(", ")} +${symbols.length - 2}`;
}

function formatUsdForRow(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "Unavailable";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100_000 ? 0 : 2,
  }).format(value);
}

function sortQuotesForDisplay(
  a: ProtocolBorrowQuote,
  b: ProtocolBorrowQuote,
): number {
  const exact = compareRawAmounts(b.exactMaximum, a.exactMaximum);
  if (exact) return exact;
  return (
    numericSortValue(b.safeBorrowUsd) - numericSortValue(a.safeBorrowUsd) ||
    numericSortValue(b.theoreticalBorrowUsd) -
      numericSortValue(a.theoreticalBorrowUsd) ||
    b.confidenceScore - a.confidenceScore ||
    a.protocolLabel.localeCompare(b.protocolLabel)
  );
}

function sortRowsForDisplay(a: WebsiteQuoteRow, b: WebsiteQuoteRow): number {
  return (
    numericSortValue(b.safeBorrowUsd) - numericSortValue(a.safeBorrowUsd) ||
    numericSortValue(b.theoreticalBorrowUsd) -
      numericSortValue(a.theoreticalBorrowUsd) ||
    a.protocolLabel.localeCompare(b.protocolLabel)
  );
}

function numericSortValue(value: number | null | undefined): number {
  return value ?? Number.NEGATIVE_INFINITY;
}
