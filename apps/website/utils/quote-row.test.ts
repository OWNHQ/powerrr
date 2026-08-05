import { describe, expect, it } from "vitest";
import type { ProtocolBorrowQuote } from "@powerrr/shared-types";
import {
  collateralDisplay,
  freshnessLabel,
  groupWebsiteQuoteRows,
  termLabel,
  toWebsiteQuoteRow,
} from "./quote-row.js";

const quote: ProtocolBorrowQuote = {
  protocolId: "compound-iii",
  protocolLabel: "Compound III",
  familyId: "compound-iii",
  familyLabel: "Compound III",
  chainId: 1,
  mode: "wallet-estimate",
  theoreticalBorrowUsd: 50_000,
  safeBorrowUsd: 42_500,
  existingDebtUsd: 0,
  availableLiquidityUsd: 750_000,
  targetBorrowAsset: "USD",
  rateType: "fixed",
  indicativeApr: 0.095,
  termMonths: 24,
  liquidationRisk: "ltv-threshold",
  collateralUsed: [
    {
      token: "0x0000000000000000000000000000000000000001",
      symbol: "WETH",
      valueUsd: 30_000,
      ltv: 0.52,
      liquidationThreshold: 0.6,
      valueExact: usd(30_000),
      ltvExact: ratio(0.52),
      liquidationThresholdExact: ratio(0.6),
    },
    {
      token: "0x0000000000000000000000000000000000000002",
      symbol: "WBTC",
      valueUsd: 20_000,
      ltv: 0.48,
      liquidationThreshold: 0.55,
      valueExact: usd(20_000),
      ltvExact: ratio(0.48),
      liquidationThresholdExact: ratio(0.55),
    },
    {
      token: "0x0000000000000000000000000000000000000003",
      symbol: "USDC",
      valueUsd: 10_000,
      ltv: 0.72,
      liquidationThreshold: 0.75,
      valueExact: usd(10_000),
      ltvExact: ratio(0.72),
      liquidationThresholdExact: ratio(0.75),
    },
  ],
  healthFactor: null,
  riskLevel: "medium",
  confidence: "medium",
  confidenceScore: 80,
  stale: false,
  timestamp: "2026-07-01T00:00:00.000Z",
  assumptions: [],
  warnings: [],
  provenance: [
    {
      source: "Compound fixture",
      sourceType: "assumption",
      freshnessSeconds: 0,
    },
  ],
  exactMaximum: usd(42_500),
};

function usd(value: number) {
  return { raw: BigInt(Math.round(value * 1_000_000)).toString(), decimals: 6 };
}

function ratio(value: number) {
  return {
    numerator: BigInt(Math.round(value * 1_000_000)).toString(),
    denominator: "1000000",
  };
}

describe("website quote row mapping", () => {
  it("maps protocol quote output to the required website row fields", () => {
    const row = toWebsiteQuoteRow(quote);

    expect(row.protocolLabel).toBe("Compound III");
    expect(row.amountDisplay).toBe("$42,500.00");
    expect(row.eligibleCollateralUsd).toBe(60_000);
    expect(row.eligibleCollateralDisplay).toBe("WETH, WBTC +1");
    expect(row.termLabel).toBe("24 month");
    expect(row.freshnessLabel).toBe("Assumption");
    expect(row.cta.action).toBe("open-drawer");
  });

  it("formats freshness, collateral, and term helpers", () => {
    expect(termLabel({ termMonths: null })).toBe("Open-ended");
    expect(collateralDisplay({ collateralUsed: [] })).toBe("None");
    expect(freshnessLabel({ stale: true, provenance: [] })).toBe("Stale");
    expect(
      freshnessLabel({
        stale: false,
        provenance: [
          { source: "Aave", sourceType: "official-api", freshnessSeconds: 12 },
        ],
      }),
    ).toBe("12s old");
  });

  it("groups protocol variants by family while preserving the best adapter quote", () => {
    const aaveV3: ProtocolBorrowQuote = {
      ...quote,
      protocolId: "aave-v3",
      protocolLabel: "Aave v3",
      familyId: "aave",
      familyLabel: "Aave",
      safeBorrowUsd: 80_000,
      theoreticalBorrowUsd: 90_000,
      confidenceScore: 93,
      exactMaximum: usd(80_000),
    };
    const aaveV4: ProtocolBorrowQuote = {
      ...quote,
      protocolId: "aave-v4",
      protocolLabel: "Aave v4",
      familyId: "aave",
      familyLabel: "Aave",
      safeBorrowUsd: 75_000,
      theoreticalBorrowUsd: 92_000,
      confidenceScore: 88,
      exactMaximum: usd(75_000),
    };

    const groups = groupWebsiteQuoteRows([quote, aaveV4, aaveV3]);
    const aave = groups.find((group) => group.groupId === "aave");

    expect(groups).toHaveLength(2);
    expect(aave?.row.protocolLabel).toBe("Aave");
    expect(aave?.row.primaryProtocolId).toBe("aave-v3");
    expect(aave?.row.protocolsLabel).toBe("Aave v3, Aave v4");
    expect(aave?.row.cta.label).toBe("Compare");
    expect(aave?.quotes.map((item) => item.protocolId)).toEqual([
      "aave-v3",
      "aave-v4",
    ]);
  });
});
