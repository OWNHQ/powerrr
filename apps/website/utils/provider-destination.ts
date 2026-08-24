import type { ProtocolBorrowQuote } from "@powerrr/shared-types";

export type ProviderDestination = {
  href: string;
  label: string;
};

const FIXED_ETHEREUM_DESTINATIONS: Record<string, ProviderDestination> = {
  "aave-v3": {
    href: "https://app.aave.com/?marketName=proto_mainnet_v3",
    label: "Aave Ethereum Core V3",
  },
  sparklend: {
    href: "https://app.spark.fi/markets/?marketName=proto_spark_v3",
    label: "SparkLend Ethereum",
  },
  "compound-iii": {
    href: "https://app.compound.finance/markets/usdc-mainnet",
    label: "Compound Ethereum USDC",
  },
};

export function providerDestination(
  protocolId: string,
  quote?: ProtocolBorrowQuote,
): ProviderDestination | undefined {
  const fixed = FIXED_ETHEREUM_DESTINATIONS[protocolId];
  if (fixed) return fixed;
  if (protocolId !== "morpho-blue" || !quote) return undefined;

  const market = quote.collateralUsed.find((item) => item.marketId);
  const marketId = market?.marketId;
  if (!marketId || !/^0x[0-9a-fA-F]{64}$/.test(marketId)) return undefined;

  return morphoMarketDestination(
    marketId,
    market.symbol,
    quote.targetBorrowAsset,
  );
}

export function morphoMarketDestination(
  marketId: string,
  collateralSymbol: string,
  loanSymbol = "USDC",
): ProviderDestination | undefined {
  if (!/^0x[0-9a-fA-F]{64}$/.test(marketId)) return undefined;
  const collateral = collateralSymbol.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const loan = loanSymbol.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    href: `https://app.morpho.org/ethereum/variable/${marketId.toLowerCase()}/${collateral}-${loan}`,
    label: `Morpho ${collateralSymbol}/${loanSymbol} market`,
  };
}
