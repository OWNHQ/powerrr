import { ethereumTop250Snapshot } from "./ethereum-top250.js";
import {
  ETHEREUM_MORPHO_USDC_MARKET_MANIFEST_VERSION,
  ETHEREUM_MORPHO_USDC_MARKET_SOURCE_BLOCK,
  ETHEREUM_MORPHO_USDC_MARKET_SOURCE_HASH,
  ETHEREUM_MORPHO_USDC_OFFICIAL_LISTED_COUNT,
  ethereumMorphoCollateralTokensV1,
  ethereumMorphoUsdcMarketsV1,
  type MorphoMarketRegistryEntry,
} from "./ethereum-morpho-usdc-markets.js";

export {
  ETHEREUM_MORPHO_USDC_MARKET_MANIFEST_VERSION,
  ETHEREUM_MORPHO_USDC_MARKET_SOURCE_BLOCK,
  ETHEREUM_MORPHO_USDC_MARKET_SOURCE_HASH,
  ETHEREUM_MORPHO_USDC_OFFICIAL_LISTED_COUNT,
  ethereumMorphoCollateralTokensV1,
  ethereumMorphoUsdcMarketsV1,
} from "./ethereum-morpho-usdc-markets.js";
export type {
  MorphoCollateralRegistryEntry,
  MorphoMarketRegistryEntry,
} from "./ethereum-morpho-usdc-markets.js";

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
export const MORPHO_BLUE =
  "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb" as const;

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
    symbol: "eBTC",
    name: "ether.fi BTC",
    address: "0x657e8C867D8B37dCC18fA4Caead9C45EB088C642",
    decimals: 8,
    category: "bitcoin",
    candidateProviders: ["aave-v3"],
  }),
  asset({
    symbol: "BTC.b",
    name: "Bitcoin",
    address: "0xB0F70C0bD6FD87dbEb7C10dC692a2a6106817072",
    decimals: 8,
    category: "bitcoin",
    candidateProviders: ["aave-v3"],
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
    address: "0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD",
    decimals: 18,
    category: "stablecoin",
    priceSource: {
      kind: "aave-oracle",
      oracle: SPARK_ORACLE,
      asset: "0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD",
    },
  }),
  asset({
    symbol: "GHO",
    name: "GHO",
    address: "0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f",
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
    address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
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
    address: "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2",
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
    address: "0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72",
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

export type OnchainPriceRoute =
  | {
      kind: "aave-oracle";
      oracle: `0x${string}`;
      asset: `0x${string}`;
    }
  | {
      kind: "chainlink-feed";
      feed: `0x${string}`;
      heartbeatSeconds: number;
      quote: "USD" | "ETH" | "BTC" | "USDC" | "USDT";
    }
  | {
      kind: "erc4626-rate";
      underlying: `0x${string}`;
    }
  | {
      kind: "contract-rate";
      underlying: `0x${string}`;
      method: "exchangeRate" | "getExchangeRate" | "exchangeRateStored";
      rateScale: string;
    }
  | {
      kind: "conversion-rate";
      underlying: `0x${string}`;
      conversionContract: `0x${string}`;
      method: "getWeETHByeETH";
    }
  | {
      kind: "morpho-oracle";
      marketId: `0x${string}`;
      oracle: `0x${string}`;
      collateralDecimals: number;
      loanDecimals: 6;
    }
  | {
      kind: "automatic-onchain";
    };

export type EthereumTokenRegistryEntry = {
  chainId: 1;
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  iconKey: string;
  snapshotRank?: number;
  marketId?: string;
  rankingSource: string;
  snapshotDate: string;
  priceRoute: OnchainPriceRoute;
};

export const ETHEREUM_TOKEN_REGISTRY_VERSION = "ethereum-top250-2026-07-29-v1";
export const ETHEREUM_TOKEN_REGISTRY_SOURCE =
  "Vendored CoinGecko Ethereum-ecosystem market-cap snapshot joined to the CoinGecko Uniswap token list; reviewed 2026-07-29";
export const ETHEREUM_TOKEN_REGISTRY_SNAPSHOT_DATE = "2026-07-29";

type ReviewedToken = readonly [
  address: `0x${string}`,
  symbol: string,
  name: string,
  decimals: number,
];

const reviewedTokens: readonly ReviewedToken[] = [
  ["0x111111111117dC0aa78b770fA6A738034120C302", "1INCH", "1inch", 18],
  ["0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9", "AAVE", "Aave", 18],
  ["0xEd04915c23f00A313a544955524EB7DBD823143d", "ACH", "Alchemy Pay", 8],
  ["0xB528edBef013aff855ac3c50b381f253aF13b997", "AEVO", "Aevo", 18],
  ["0x32353A6C91143bfd6C7d363B546e62a9A2489A20", "AGLD", "Adventure Gold", 18],
  ["0x626E8036dEB333b408Be468F951bdB42433cBF18", "AIOZ", "AIOZ Network", 18],
  ["0xdBdb4d16EdA451D0503b854CF79D55697F90c8DF", "ALCX", "Alchemix", 18],
  [
    "0x6B0b3a982b4634aC68dD83a4DBF02311cE324181",
    "ALI",
    "Artificial Liquid Intelligence",
    18,
  ],
  [
    "0xAC51066d7bEC65Dc4589368da368b212745d63E8",
    "ALICE",
    "My Neighbor Alice",
    6,
  ],
  ["0x8457CA5040ad67fdebbCC8EdCE889A335Bc0fbFB", "ALT", "AltLayer", 18],
  ["0xfF20817765cB7f73d4bde2e66e067E58D11095C2", "AMP", "Amp", 18],
  ["0x8290333ceF9e6D528dD5618Fb97a76f268f3EDD4", "ANKR", "Ankr", 18],
  ["0x4d224452801ACEd8B2F0aebE155379bb5D594381", "APE", "ApeCoin", 18],
  ["0x0b38210ea11411557c13457D4dA7dC6ea731B88a", "API3", "API3", 18],
  ["0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1", "ARB", "Arbitrum", 18],
  ["0x18aAA7115705e8be94bfFEBDE57Af9BFc265B998", "AUDIO", "Audius", 18],
  ["0xBB0E17EF65F82Ab018d8EDd776e8DD940327B28b", "AXS", "Axie Infinity", 18],
  ["0x3472A5A71965499acd81997a54BBA8D852C6E53d", "BADGER", "Badger DAO", 18],
  ["0xba100000625a3754423978a60c9317c58a424e3D", "BAL", "Balancer", 18],
  ["0xB0F70C0bD6FD87dbEb7C10dC692a2a6106817072", "BTC.b", "Bitcoin", 8],
  ["0xBA11D00c5f74255f56a5E366F4F77f5A186d7f55", "BAND", "Band Protocol", 18],
  [
    "0x0D8775F648430679A709E98d2b0Cb6250d2887EF",
    "BAT",
    "Basic Attention Token",
    18,
  ],
  ["0xF17e65822b568B3903685a7c9F496CF7656Cc6C2", "BICO", "Biconomy", 18],
  ["0x64Bc2cA1Be492bE7185FAA2c8835d9b824c8a194", "BIGTIME", "Big Time", 18],
  ["0x5283D291DBCF85356A21bA090E6db59121208b44", "BLUR", "Blur", 18],
  [
    "0x1F573D6Fb3F13d689FF844B4cE37794d79a7FF1C",
    "BNT",
    "Bancor Network Token",
    18,
  ],
  ["0x4Fabb145d64652a948d72533023f6E7A623C7C53", "BUSD", "Binance USD", 18],
  ["0xAE12C5930881c53715B369ceC7606B70d8EB229f", "C98", "Coin98", 18],
  ["0x152649eA73beAb28c5b49B26eb48f7EAD6d4c898", "CAKE", "PancakeSwap", 18],
  [
    "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
    "cbBTC",
    "Coinbase Wrapped BTC",
    8,
  ],
  [
    "0xBe9895146f7AF43049ca1c1AE358B0541Ea49704",
    "cbETH",
    "Coinbase Wrapped Staked ETH",
    18,
  ],
  ["0x3294395e62F4eB6aF3f1Fcf89f5602D90Fb3Ef69", "CELO", "Celo (Wormhole)", 18],
  ["0x4F9254C83EB525f9FCf346490bbb3ed28a81C667", "CELR", "Celer Network", 18],
  ["0xcccCCCcCCC33D538DBC2EE4fEab0a7A1FF4e8A94", "CFG", "Centrifuge", 18],
  ["0x3506424F91fD33084466F402d5D97f05F8e3b4AF", "CHZ", "Chiliz", 18],
  ["0xc00e94Cb662C3520282E6f5717214004A7f26888", "COMP", "Compound", 18],
  ["0xDDB3422497E61e13543BeA06989C0789117555c5", "COTI", "COTI", 18],
  ["0xDEf1CA1fb7FBcDC777520aa7f396b4E015F497aB", "COW", "CoW Protocol", 18],
  ["0xA0b73E1Ff0B80914AB6fe0444E65848C4C34450b", "CRO", "Cronos", 8],
  ["0xD533a949740bb3306d119CC777fa900bA034cd52", "CRV", "Curve DAO Token", 18],
  ["0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E", "crvUSD", "Curve USD", 18],
  ["0x491604c0FDF08347Dd1fa4Ee062a822A5DD06B5D", "CTSI", "Cartesi", 18],
  ["0x41e5560054824eA6B0732E656E3Ad64E20e94E45", "CVC", "Civic", 8],
  ["0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B", "CVX", "Convex Finance", 18],
  ["0x6B175474E89094C44Da98b954EedeAC495271d0F", "DAI", "Dai Stablecoin", 18],
  ["0xfB7B4564402E5500dB5bB6d63Ae671302777C75a", "DEXT", "DexTools", 18],
  ["0x84cA8bc7997272c7CfB4D0Cd3D55cd942B3c9419", "DIA", "DIA", 18],
  ["0x1494CA1F11D487c2bBe4543E90080AeBa4BA3C2b", "DPI", "DeFi Pulse Index", 18],
  ["0x657e8C867D8B37dCC18fA4Caead9C45EB088C642", "eBTC", "ether.fi BTC", 8],
  ["0xec53bF9167f50cDEB3Ae105f56099aaaB9061F83", "EIGEN", "EigenLayer", 18],
  ["0x57e114B691Db790C35207b2e685D4A43181e6061", "ENA", "Ethena", 18],
  ["0xF629cBd94d3791C9250152BD8dfBDF380E2a3B9c", "ENJ", "Enjin Coin", 18],
  [
    "0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72",
    "ENS",
    "Ethereum Name Service",
    18,
  ],
  ["0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c", "EURC", "Euro Coin", 6],
  ["0xFe0c30065B384F05761f15d0CC899D4F9F9Cc0eB", "ETHFI", "Ether.fi", 18],
  ["0xaea46A60368A7bD060eec7DF8CBa43b7EF41Ad85", "FET", "Fetch.ai", 18],
  ["0xcf0C122c6b73ff809C693DB761e7BaeBe62b6a2E", "FLOKI", "FLOKI", 9],
  ["0x853d955aCEf822Db058eb8505911ED77F175b99e", "FRAX", "Frax", 18],
  ["0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0", "FXS", "Frax Share", 18],
  ["0xd1d2Eb1B1e90B638588728b4130137D262C87cae", "GALA", "GALA", 8],
  ["0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f", "GHO", "GHO", 18],
  ["0xc944E90C64B2c07662A292be6244BDf05Cda44a7", "GRT", "The Graph", 18],
  ["0x767FE9EDC9E0dF98E07454847909b5E959D7ca0E", "ILV", "Illuvium", 18],
  ["0xF57e7e7C23978C3cAEC3C3548E3D615c346e79fF", "IMX", "Immutable X", 18],
  ["0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32", "LDO", "Lido DAO", 18],
  ["0x514910771AF9Ca656af840dff83E8264EcF986CA", "LINK", "Chainlink", 18],
  ["0x58b6A8A3302369DAEc383334672404Ee733aB239", "LPT", "Livepeer", 18],
  ["0x6DEA81C8171D0bA574754EF6F8b412F2Ed88c54D", "LQTY", "Liquity", 18],
  ["0xBBbbCA6A901c926F240b89EacB641d8Aec7AEafD", "LRC", "Loopring", 18],
  ["0x5f98805A4E8be255a32880FDeC7F6728C6568bA0", "LUSD", "Liquity USD", 18],
  ["0x0F5D2fB29fb7d3CFeE444a200298f468908cC942", "MANA", "Decentraland", 18],
  ["0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0", "MATIC", "Polygon", 18],
  ["0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2", "MKR", "Maker", 18],
  ["0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3", "ONDO", "Ondo Finance", 18],
  ["0x808507121B80c02388fAd14726482e061B8da827", "PENDLE", "Pendle", 18],
  ["0x6982508145454Ce325dDbE47a25d4ec3d2311933", "PEPE", "Pepe", 18],
  [
    "0x455e53CBB86018Ac2B8092FdCd39d8444aFFC3F6",
    "POL",
    "Polygon Ecosystem Token",
    18,
  ],
  ["0x6c3ea9036406852006290770BEdFcAbA0e23A0e8", "PYUSD", "PayPal USD", 6],
  ["0x4a220E6096B25EADb88358cb44068A3248254675", "QNT", "Quant", 18],
  ["0x6123B0049F904d730dB3C36a31167D9d4121fA6B", "RBN", "Ribbon Finance", 18],
  ["0xae78736Cd615f374D3085123A210448E74Fc6393", "rETH", "Rocket Pool ETH", 18],
  ["0xD33526068D116cE69F19A9ee46F0bd304F21A51f", "RPL", "Rocket Pool", 18],
  ["0x320623b8E4fF03373931769A31Fc52A4E78B5d70", "RSR", "Reserve Rights", 18],
  ["0x5aFE3855358E112B5647B952709E6165e1c1eEEe", "SAFE", "Safe", 18],
  ["0x83F20F44975D03b1b09e64809B757c47f942BEeA", "sDAI", "Savings Dai", 18],
  ["0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", "SHIB", "Shiba Inu", 18],
  ["0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F", "SNX", "Synthetix", 18],
  [
    "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
    "stETH",
    "Lido Staked Ether",
    18,
  ],
  ["0x6B3595068778DD592e39A122f4f5a5cF09C90fE2", "SUSHI", "Sushi", 18],
  ["0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD", "sUSDS", "Savings USDS", 18],
  ["0x18084fbA666a33d37592fA2633fD49a74DD93a88", "tBTC", "tBTC", 18],
  ["0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", "UNI", "Uniswap", 18],
  ["0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "USDC", "USD Coin", 6],
  ["0x4c9EDD5852cd905f086C759E8383e09bff1E68B3", "USDe", "Ethena USDe", 18],
  ["0xdC035D45d973E3EC169d2276DDab16f1e407384F", "USDS", "USDS", 18],
  ["0xdAC17F958D2ee523a2206206994597C13D831ec7", "USDT", "Tether USD", 6],
  ["0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", "WBTC", "Wrapped Bitcoin", 8],
  ["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "WETH", "Wrapped Ether", 18],
  ["0x4691937a7508860F876c9c0a2a617E7d9E945D4B", "WOO", "WOO Network", 18],
  ["0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", "wstETH", "Wrapped stETH", 18],
  ["0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e", "YFI", "yearn.finance", 18],
  ["0xE41d2489571d322189246DaFA5ebDe1F4699F498", "ZRX", "0x Protocol", 18],
] as const;

const top250Tokens: readonly ReviewedToken[] = ethereumTop250Snapshot.map(
  ({ address, symbol, name, decimals }) => [address, symbol, name, decimals],
);

const reviewedRegistryAdditions: readonly ReviewedToken[] = [
  ...reviewedTokens.filter(([address]) =>
    ethereumAssetRegistryV1.some(
      (asset) =>
        asset.assetKind !== "native" &&
        asset.address.toLowerCase() === address.toLowerCase(),
    ),
  ),
  ...ethereumMorphoCollateralTokensV1.map(
    (token) =>
      [token.address, token.symbol, token.name, token.decimals] as const,
  ),
];

const allReviewedTokens = [
  ...top250Tokens,
  ...reviewedRegistryAdditions,
].filter(
  (token, index, all) =>
    all.findIndex(
      (candidate) => candidate[0].toLowerCase() === token[0].toLowerCase(),
    ) === index,
);

// Direct proxies published in Chainlink's Ethereum mainnet feed inventory.
// These feeds are not exposed through the legacy Feed Registry, so each route
// is bound to one reviewed token contract instead of inferred from its symbol.
const reviewedDirectChainlinkFeeds: Readonly<
  Record<
    string,
    {
      feed: `0x${string}`;
      heartbeatSeconds: number;
      quote: "USD" | "ETH" | "BTC" | "USDC" | "USDT";
    }
  >
> = {
  // United Stables U / USD
  "0xce24439f2d9c6a2289f741120fe202248b666666": {
    feed: "0xF6351B2dCF0110E76c71C1d319Af2f410454B6f3",
    heartbeatSeconds: 86_400,
    quote: "USD",
  },
  // POL (published by Chainlink under the legacy MATIC pair name) / USD
  "0x455e53cbb86018ac2b8092fdcd39d8444affc3f6": {
    feed: "0x7bAC85A8a13A4BcD8abb3eB7d6b4d632c5a57676",
    heartbeatSeconds: 86_400,
    quote: "USD",
  },
  // Arbitrum ARB / USD
  "0xb50721bcf8d664c30412cfbc6cf7a15145234ad1": {
    feed: "0x31697852a68433DbCc2Ff612c516d69E3D9bd08F",
    heartbeatSeconds: 86_400,
    quote: "USD",
  },
  // USDD / USDC exchange rate
  "0x4f8e5de400de08b164e7421b3ee387f461becd1a": {
    feed: "0xBfC7d98Eea35380ceEC0a1DC1702Ea186723602C",
    heartbeatSeconds: 86_400,
    quote: "USDC",
  },
  // USYC USD NAV (Aave LlamaGuard)
  "0x136471a34f6ef19fe571effc1ca711fdb8e49f2b": {
    feed: "0xE8E65Fb9116875012F5990Ecaab290B3531DbeB9",
    heartbeatSeconds: 97_200,
    quote: "USD",
  },
  // APXUSD / USD exchange rate
  "0x98a878b1cd98131b271883b390f68d2c90674665": {
    feed: "0x651b101f72F82630cf59c68E6EE4305aFBd3B1F5",
    heartbeatSeconds: 86_400,
    quote: "USD",
  },
  // solvBTC / BTC reference price
  "0x7a56e1c57c7475ccf742a1832b028f0456652f97": {
    feed: "0x936B31C428C29713343E05D631e69304f5cF5f49",
    heartbeatSeconds: 86_400,
    quote: "BTC",
  },
  // MANA / ETH reference price
  "0x0f5d2fb29fb7d3cfee444a200298f468908cc942": {
    feed: "0x82A44D92D6c329826dc557c5E1Be6ebeC5D5FeB9",
    heartbeatSeconds: 86_400,
    quote: "ETH",
  },
  // OETH / ETH reference price
  "0x856c4efb76c1d1ae02e20ceb03a2a6a08b0b8dc3": {
    feed: "0x703118C4CbccCBF2AB31913e0f8075fbbb15f563",
    heartbeatSeconds: 86_400,
    quote: "ETH",
  },
  // Saturn sUSDat USD NAV
  "0xd166337499e176bbc38a1fbd113ab144e5bd2df7": {
    feed: "0x73B8E902638a21B4d0319CF99Fa333b2727AD318",
    heartbeatSeconds: 86_400,
    quote: "USD",
  },
  // uniBTC / BTC exchange rate
  "0x004e9c3ef86bc1ca1f0bb5c7662861ee93350568": {
    feed: "0x861d15F8a4059cb918bD6F3670adAEB1220B298f",
    heartbeatSeconds: 86_400,
    quote: "BTC",
  },
};

// ERC-4626 share contracts whose `asset()` identity and redemption method were
// reviewed on Ethereum. The wrapper remains a distinct wallet asset; this
// route only derives its USD value from the exact block-pinned share rate and
// a separately appraised underlying token.
const reviewedErc4626PriceRoutes: Readonly<Record<string, `0x${string}`>> = {
  "0x80ac24aa929eaf5013f6436cda2a7ba190f5cc0b":
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // syrupUSDC -> USDC
  "0xc5d6a7b61d18afa11435a889557b068bb9f29930":
    "0x4f8e5DE400DE08B164E7421B3EE387f461beCD1A", // sUSDD -> USDD
  "0xbc65ad17c5c0a2a4d159fa5a503f4992c7b545fe":
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // Spark sUSDC -> USDC
  "0x38eeb52f0771140d10c4e9a9a72349a329fe8a6a":
    "0x98A878b1Cd98131B271883B390f68D2c90674665", // apyUSD -> apxUSD
  "0x5fa487bca6158c64046b2813623e20755091da0b":
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // thBILL -> USDC
  "0x7bc3485026ac48b6cf9baf0a377477fff5703af8":
    "0xdAC17F958D2ee523a2206206994597C13D831ec7", // wrapped Aave USDT -> USDT
  "0x87b65c4aaffa76881f9e96f3e7ed945ddfc3cd7a":
    "0xe343167631d89B6Ffc58B88d6b7fB0228795491D", // syrupUSDG -> USDG
  "0xac3e018457b222d93114458476f3e3416abbe38f":
    "0x5E8422345238F34275888049021821E8E08CAa1f", // sfrxETH -> frxETH
  "0x8be3460a480c80728a8c4d7a5d5303c85ba7b3b9":
    "0x57e114B691Db790C35207b2e685D4A43181e6061", // sENA -> ENA
  "0xd166337499e176bbc38a1fbd113ab144e5bd2df7":
    "0x23238f20b894f29041f48D88eE91131C395Aaa71", // sUSDat -> USDat
  "0xd4fa2d31b7968e448877f69a96de69f5de8cd23e":
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // wrapped Aave USDC -> USDC
  "0x8c9532a60e0e7c6bbd2b2c1303f63ace1c3e9811":
    "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", // pzETH -> wstETH
};

const reviewedContractRatePriceRoutes: Readonly<
  Record<
    string,
    {
      underlying: `0x${string}`;
      method: "exchangeRate" | "getExchangeRate" | "exchangeRateStored";
      rateScale: string;
    }
  >
> = {
  "0xa2e3356610840701bdf5611a53974510ae27e2e1": {
    underlying: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    method: "exchangeRate",
    rateScale: "1000000000000000000",
  }, // WBETH -> ETH
  "0x4da27a545c0c5b758a6ba100e3a049001de870f5": {
    underlying: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
    method: "getExchangeRate",
    rateScale: "1000000000000000000",
  }, // stkAAVE -> AAVE
  "0xfe18ae03741a5b84e39c295ac9c856ed7991c38e": {
    underlying: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    method: "exchangeRate",
    rateScale: "1000000000000000000",
  }, // CDCETH -> ETH
  "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643": {
    underlying: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    method: "exchangeRateStored",
    rateScale: "10000000000000000000000000000",
  }, // cDAI -> DAI; Compound scale = 1e(18 + 18 - 8)
};

const reviewedConversionRatePriceRoutes: Readonly<
  Record<
    string,
    {
      underlying: `0x${string}`;
      conversionContract: `0x${string}`;
      method: "getWeETHByeETH";
    }
  >
> = {
  "0x35fa164735182de50811e8e2e824cfb9b6118ac2": {
    underlying: "0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee",
    conversionContract: "0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee",
    method: "getWeETHByeETH",
  }, // eETH -> weETH; valuation only, not protocol-equivalence
};

export const ethereumTokenRegistryV1: readonly EthereumTokenRegistryEntry[] =
  allReviewedTokens.map(([address, symbol, name, decimals]) => {
    const existing = ethereumAssetRegistryV1.find(
      (asset) => asset.address.toLowerCase() === address.toLowerCase(),
    );
    const ranked = ethereumTop250Snapshot.find(
      (token) => token.address.toLowerCase() === address.toLowerCase(),
    );
    const directChainlinkFeed =
      reviewedDirectChainlinkFeeds[address.toLowerCase()];
    const erc4626Underlying = reviewedErc4626PriceRoutes[address.toLowerCase()];
    const contractRate = reviewedContractRatePriceRoutes[address.toLowerCase()];
    const conversionRate =
      reviewedConversionRatePriceRoutes[address.toLowerCase()];
    const morphoCollateral = ethereumMorphoCollateralTokensV1.find(
      (token) => token.address.toLowerCase() === address.toLowerCase(),
    );
    return {
      chainId: 1,
      address,
      symbol,
      name,
      decimals,
      iconKey: existing?.iconKey ?? symbol.toLowerCase(),
      ...(ranked
        ? { snapshotRank: ranked.snapshotRank, marketId: ranked.marketId }
        : {}),
      rankingSource: ranked
        ? ETHEREUM_TOKEN_REGISTRY_SOURCE
        : morphoCollateral
          ? `Morpho official listed Ethereum USDC markets verified at block ${ETHEREUM_MORPHO_USDC_MARKET_SOURCE_BLOCK}`
          : ETHEREUM_TOKEN_REGISTRY_SOURCE,
      snapshotDate: morphoCollateral
        ? "2026-08-06"
        : ETHEREUM_TOKEN_REGISTRY_SNAPSHOT_DATE,
      priceRoute:
        existing && existing.assetKind !== "convertible"
          ? {
              kind: "aave-oracle" as const,
              oracle: existing.priceSource.oracle,
              asset: existing.priceSource.asset,
            }
          : directChainlinkFeed
            ? {
                kind: "chainlink-feed" as const,
                ...directChainlinkFeed,
              }
            : erc4626Underlying
              ? {
                  kind: "erc4626-rate" as const,
                  underlying: erc4626Underlying,
                }
              : contractRate
                ? {
                    kind: "contract-rate" as const,
                    ...contractRate,
                  }
                : conversionRate
                  ? {
                      kind: "conversion-rate" as const,
                      ...conversionRate,
                    }
                  : morphoCollateral?.priceOracle &&
                      morphoCollateral.priceMarketId
                    ? {
                        kind: "morpho-oracle" as const,
                        marketId: morphoCollateral.priceMarketId,
                        oracle: morphoCollateral.priceOracle,
                        collateralDecimals: morphoCollateral.decimals,
                        loanDecimals: 6 as const,
                      }
                    : {
                        kind: "automatic-onchain" as const,
                      },
    };
  });

export const ETHEREUM_TOKEN_REGISTRY_RANKED_COUNT = top250Tokens.length;
export const ethereumTokenRegistryAdditionsV1 = ethereumTokenRegistryV1.filter(
  (token) => token.snapshotRank === undefined,
);
export const ETHEREUM_TOKEN_REGISTRY_ADDITION_COUNT =
  ethereumTokenRegistryAdditionsV1.length;
export const ETHEREUM_TOKEN_REGISTRY_TOTAL_COUNT =
  ethereumTokenRegistryV1.length;

for (const asset of ethereumAssetRegistryV1) {
  if (
    asset.protocolAssetToken &&
    (!asset.conversion || !asset.requiredAction)
  ) {
    throw new Error(
      `${asset.symbol} maps to a protocol token without a reviewed conversion`,
    );
  }
}

export function ethereumTokenByAddress(
  address: string,
): EthereumTokenRegistryEntry | undefined {
  return ethereumTokenRegistryV1.find(
    (token) => token.address.toLowerCase() === address.toLowerCase(),
  );
}

export type EthereumMorphoUsdcMarket = MorphoMarketRegistryEntry;
