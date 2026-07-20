export const supportedChains = [
  {
    chainId: 1,
    label: "Ethereum mainnet",
    nativeCurrency: "ETH",
  },
] as const;

export type EthereumAssetCategory =
  "native-wrapped" | "liquid-staking" | "bitcoin" | "stablecoin" | "governance";

export type EthereumProviderId =
  "aave-v3" | "sparklend" | "compound-iii" | "morpho-blue" | "own";

export type EthereumAssetRegistryEntry = {
  symbol: string;
  name: string;
  address: `0x${string}`;
  decimals: number;
  category: EthereumAssetCategory;
  candidateProviders: EthereumProviderId[];
  iconKey: string;
  priceSource: {
    kind: "aave-oracle";
    oracle: `0x${string}`;
    asset: `0x${string}`;
  };
  assetKind: "native" | "erc20" | "convertible";
  protocolAssetToken?: `0x${string}`;
  requiredAction?: "wrap";
  conversion?: {
    kind: "one-to-one" | "wsteth";
    contract?: `0x${string}`;
  };
};

export const ETHEREUM_ASSET_REGISTRY_VERSION = "ethereum-blue-chip-v1";
export const ETHEREUM_NATIVE_TOKEN =
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as const;
export const AAVE_V3_ORACLE =
  "0x54586bE62E3c3580375aE3723C145253060Ca0C2" as const;
export const SPARK_ORACLE =
  "0x8105f69D9C41644c6A0803fDA7D03Aa70996cFD9" as const;

const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as const;
const WSTETH = "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0" as const;
const ALL_LIVE_PROVIDERS: EthereumProviderId[] = [
  "aave-v3",
  "sparklend",
  "compound-iii",
  "morpho-blue",
];

function asset(
  input: Omit<
    EthereumAssetRegistryEntry,
    "candidateProviders" | "iconKey" | "priceSource" | "assetKind"
  > &
    Partial<
      Pick<
        EthereumAssetRegistryEntry,
        "candidateProviders" | "iconKey" | "priceSource" | "assetKind"
      >
    >,
): EthereumAssetRegistryEntry {
  return {
    ...input,
    candidateProviders: input.candidateProviders ?? ALL_LIVE_PROVIDERS,
    iconKey: input.iconKey ?? input.symbol.toLowerCase(),
    priceSource: input.priceSource ?? {
      kind: "aave-oracle",
      oracle: AAVE_V3_ORACLE,
      asset: input.address,
    },
    assetKind: input.assetKind ?? "erc20",
  };
}

/**
 * Deliberately finite Ethereum discovery registry. Wallet discovery must iterate
 * this list and must never turn into arbitrary token enumeration.
 */
export const ethereumAssetRegistryV1: readonly EthereumAssetRegistryEntry[] = [
  asset({
    symbol: "ETH",
    name: "Ether",
    address: ETHEREUM_NATIVE_TOKEN,
    decimals: 18,
    category: "native-wrapped",
    assetKind: "native",
    protocolAssetToken: WETH,
    requiredAction: "wrap",
    conversion: { kind: "one-to-one" },
    priceSource: { kind: "aave-oracle", oracle: AAVE_V3_ORACLE, asset: WETH },
    candidateProviders: ALL_LIVE_PROVIDERS,
  }),
  asset({
    symbol: "WETH",
    name: "Wrapped Ether",
    address: WETH,
    decimals: 18,
    category: "native-wrapped",
  }),
  asset({
    symbol: "stETH",
    name: "Lido Staked Ether",
    address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
    decimals: 18,
    category: "liquid-staking",
    assetKind: "convertible",
    protocolAssetToken: WSTETH,
    requiredAction: "wrap",
    conversion: { kind: "wsteth", contract: WSTETH },
    priceSource: { kind: "aave-oracle", oracle: AAVE_V3_ORACLE, asset: WSTETH },
    candidateProviders: ["aave-v3", "sparklend", "morpho-blue"],
  }),
  asset({
    symbol: "wstETH",
    name: "Wrapped stETH",
    address: WSTETH,
    decimals: 18,
    category: "liquid-staking",
  }),
  asset({
    symbol: "rETH",
    name: "Rocket Pool ETH",
    address: "0xae78736Cd615f374D3085123A210448E74Fc6393",
    decimals: 18,
    category: "liquid-staking",
  }),
  asset({
    symbol: "cbETH",
    name: "Coinbase Wrapped Staked ETH",
    address: "0xBe9895146f7AF43049ca1c1AE358B0541Ea49704",
    decimals: 18,
    category: "liquid-staking",
  }),
  asset({
    symbol: "WBTC",
    name: "Wrapped Bitcoin",
    address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    decimals: 8,
    category: "bitcoin",
  }),
  asset({
    symbol: "cbBTC",
    name: "Coinbase Wrapped BTC",
    address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
    decimals: 8,
    category: "bitcoin",
  }),
  asset({
    symbol: "tBTC",
    name: "Threshold Bitcoin",
    address: "0x18084fbA666a33d37592fA2633fD49a74DD93a88",
    decimals: 18,
    category: "bitcoin",
  }),
  asset({
    symbol: "USDC",
    name: "USD Coin",
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    decimals: 6,
    category: "stablecoin",
  }),
  asset({
    symbol: "USDT",
    name: "Tether USD",
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    decimals: 6,
    category: "stablecoin",
  }),
  asset({
    symbol: "DAI",
    name: "Dai Stablecoin",
    address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    decimals: 18,
    category: "stablecoin",
  }),
  asset({
    symbol: "sDAI",
    name: "Savings Dai",
    address: "0x83F20F44975D03b1b09e64809B757c47f942BEeA",
    decimals: 18,
    category: "stablecoin",
  }),
  asset({
    symbol: "USDS",
    name: "USDS Stablecoin",
    address: "0xdC035D45d973E3EC169d2276DDab16f1e407384F",
    decimals: 18,
    category: "stablecoin",
    priceSource: {
      kind: "aave-oracle",
      oracle: SPARK_ORACLE,
      asset: "0xdC035D45d973E3EC169d2276DDab16f1e407384F",
    },
  }),
  asset({
    symbol: "sUSDS",
    name: "Savings USDS",
    address: "0xA3931d71877C0E7a3148CB7EB4463524feC27Fbd",
    decimals: 18,
    category: "stablecoin",
    priceSource: {
      kind: "aave-oracle",
      oracle: SPARK_ORACLE,
      asset: "0xA3931d71877C0E7a3148CB7EB4463524feC27Fbd",
    },
  }),
  asset({
    symbol: "GHO",
    name: "GHO",
    address: "0x40D16FC0246aC3360CBb2B0DC3Dc5AD24d8352C6",
    decimals: 18,
    category: "stablecoin",
  }),
  asset({
    symbol: "PYUSD",
    name: "PayPal USD",
    address: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8",
    decimals: 6,
    category: "stablecoin",
  }),
  asset({
    symbol: "LINK",
    name: "Chainlink",
    address: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
    decimals: 18,
    category: "governance",
  }),
  asset({
    symbol: "AAVE",
    name: "Aave Token",
    address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2dDAE9",
    decimals: 18,
    category: "governance",
  }),
  asset({
    symbol: "UNI",
    name: "Uniswap",
    address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
    decimals: 18,
    category: "governance",
  }),
  asset({
    symbol: "MKR",
    name: "Maker",
    address: "0x9f8F72aA9304c8B593d555F12ef6589cC3A579A2",
    decimals: 18,
    category: "governance",
  }),
  asset({
    symbol: "LDO",
    name: "Lido DAO",
    address: "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32",
    decimals: 18,
    category: "governance",
  }),
  asset({
    symbol: "ENS",
    name: "Ethereum Name Service",
    address: "0xC18360217D8F7Ab5e7c516566761ea12Ce7F9D72",
    decimals: 18,
    category: "governance",
  }),
] as const;

export function ethereumAssetMetadataByAddress(
  address: string,
): EthereumAssetRegistryEntry | undefined {
  const normalized = address.toLowerCase();
  return (
    ethereumAssetRegistryV1.find(
      (entry) => entry.address.toLowerCase() === normalized,
    ) ??
    ethereumAssetRegistryV1.find(
      (entry) => entry.protocolAssetToken?.toLowerCase() === normalized,
    )
  );
}
