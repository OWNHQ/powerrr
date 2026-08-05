import type { ProtocolBorrowQuote } from "@powerrr/shared-types";
import { describe, expect, it } from "vitest";
import { providerDestination } from "./provider-destination";

const MORPHO_MARKET_ID =
  "0x94b823e6bd8ea533b4e33fbc307faea0b307301bc48763acc4d4aa4def7636cd";

function morphoQuote(marketId = MORPHO_MARKET_ID): ProtocolBorrowQuote {
  return {
    protocolId: "morpho-blue",
    protocolLabel: "Morpho",
    familyId: "morpho-blue",
    familyLabel: "Morpho",
    chainId: 1,
    mode: "wallet-estimate",
    theoreticalBorrowUsd: 1,
    safeBorrowUsd: 1,
    targetBorrowAsset: "USDC",
    rateType: "variable",
    liquidationRisk: "ltv-threshold",
    collateralUsed: [
      {
        token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        symbol: "WETH",
        valueUsd: 1,
        valueExact: { raw: "1000000", decimals: 6 },
        ltv: 0.86,
        ltvExact: { numerator: "86", denominator: "100" },
        liquidationThreshold: 0.86,
        liquidationThresholdExact: { numerator: "86", denominator: "100" },
        marketId,
      },
    ],
    riskLevel: "medium",
    confidence: "high",
    confidenceScore: 1,
    stale: false,
    timestamp: "2026-08-05T00:00:00.000Z",
    assumptions: [],
    warnings: [],
    provenance: [],
    exactMaximum: { raw: "1000000", decimals: 6 },
  };
}

describe("providerDestination", () => {
  it.each([
    [
      "aave-v3",
      "https://app.aave.com/?marketName=proto_mainnet_v3",
      "Aave Ethereum Core V3",
    ],
    [
      "sparklend",
      "https://app.spark.fi/markets/?marketName=proto_spark_v3",
      "SparkLend Ethereum",
    ],
    [
      "compound-iii",
      "https://app.compound.finance/markets/usdc-mainnet",
      "Compound Ethereum USDC",
    ],
  ])("links %s to its exact Ethereum market", (id, href, label) => {
    expect(providerDestination(id)).toEqual({ href, label });
  });

  it("builds the exact Morpho market link from the quote", () => {
    expect(providerDestination("morpho-blue", morphoQuote())).toEqual({
      href: `https://app.morpho.org/ethereum/variable/${MORPHO_MARKET_ID}/weth-usdc`,
      label: "Morpho WETH/USDC market",
    });
  });

  it("never falls back to a generic Morpho page", () => {
    expect(providerDestination("morpho-blue")).toBeUndefined();
    expect(
      providerDestination("morpho-blue", morphoQuote("not-a-market-id")),
    ).toBeUndefined();
  });
});
