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

export type OnchainPriceRoute =
  | {
      kind: "aave-oracle";
      oracle: `0x${string}`;
      asset: `0x${string}`;
    }
  | {
      kind: "unavailable";
      reason: string;
    };

export type OwnTokenPolicy = {
  eligible: true;
  advanceRate: number;
  valuationHaircut: number;
  contributionCapUsd: number;
  concentrationFamily: "CORE_ETH" | "CORE_BTC" | "CORE_USD" | "NON_CORE";
  provisional: boolean;
};

export type EthereumOwnTokenRegistryEntry = {
  chainId: 1;
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  iconKey: string;
  priceRoute: OnchainPriceRoute;
  ownPolicy: OwnTokenPolicy;
};

export const ETHEREUM_OWN_TOKEN_REGISTRY_VERSION =
  "ethereum-own-top100-2026-07-21-r2";
export const ETHEREUM_OWN_TOKEN_REGISTRY_SOURCE =
  "Vendored Uniswap Ethereum token-list snapshot reviewed 2026-07-21";

type ReviewedToken = readonly [
  address: `0x${string}`,
  symbol: string,
  name: string,
  decimals: number,
];

const reviewedOwnTokens: readonly ReviewedToken[] = [
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
  ["0x7d1AfA7B718fb893dB30A3aBc0Cfc608AaCfebb0", "MATIC", "Polygon", 18],
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
  ["0xA3931d71877C0E7a3148CB7EB4463524feC27Fbd", "sUSDS", "Savings USDS", 18],
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

const coreOwnPolicy: Record<
  string,
  Omit<OwnTokenPolicy, "eligible" | "provisional">
> = {
  WETH: {
    advanceRate: 0.95,
    valuationHaircut: 0.04,
    contributionCapUsd: 500_000,
    concentrationFamily: "CORE_ETH",
  },
  wstETH: {
    advanceRate: 0.95,
    valuationHaircut: 0.04,
    contributionCapUsd: 500_000,
    concentrationFamily: "CORE_ETH",
  },
  WBTC: {
    advanceRate: 0.95,
    valuationHaircut: 0.06,
    contributionCapUsd: 500_000,
    concentrationFamily: "CORE_BTC",
  },
  cbBTC: {
    advanceRate: 0.95,
    valuationHaircut: 0.06,
    contributionCapUsd: 500_000,
    concentrationFamily: "CORE_BTC",
  },
  USDC: {
    advanceRate: 0.95,
    valuationHaircut: 0.02,
    contributionCapUsd: 500_000,
    concentrationFamily: "CORE_USD",
  },
  DAI: {
    advanceRate: 0.95,
    valuationHaircut: 0.02,
    contributionCapUsd: 500_000,
    concentrationFamily: "CORE_USD",
  },
  USDS: {
    advanceRate: 0.95,
    valuationHaircut: 0.02,
    contributionCapUsd: 500_000,
    concentrationFamily: "CORE_USD",
  },
};

export const ethereumOwnTokenRegistryV1: readonly EthereumOwnTokenRegistryEntry[] =
  reviewedOwnTokens.map(([address, symbol, name, decimals]) => {
    const existing = ethereumAssetRegistryV1.find(
      (asset) => asset.address.toLowerCase() === address.toLowerCase(),
    );
    const corePolicy = coreOwnPolicy[symbol];
    return {
      chainId: 1,
      address: address.toLowerCase() as `0x${string}`,
      symbol,
      name,
      decimals,
      iconKey: existing?.iconKey ?? symbol.toLowerCase(),
      priceRoute:
        existing && existing.assetKind !== "convertible"
          ? {
              kind: "aave-oracle" as const,
              oracle: existing.priceSource.oracle,
              asset: existing.priceSource.asset,
            }
          : {
              kind: "unavailable" as const,
              reason:
                "No reviewed manipulation-resistant onchain USD route is pinned in this registry version.",
            },
      ownPolicy: corePolicy
        ? { eligible: true as const, provisional: false, ...corePolicy }
        : {
            eligible: true as const,
            advanceRate: 0.2,
            valuationHaircut: 0.5,
            contributionCapUsd: 50_000,
            concentrationFamily: "NON_CORE" as const,
            provisional: true,
          },
    };
  });

export function ethereumOwnTokenByAddress(
  address: string,
): EthereumOwnTokenRegistryEntry | undefined {
  return ethereumOwnTokenRegistryV1.find(
    (token) => token.address.toLowerCase() === address.toLowerCase(),
  );
}

export type EthereumMorphoUsdcMarket = {
  marketId: `0x${string}`;
  loanToken: `0x${string}`;
  loanSymbol: "USDC";
  loanDecimals: 6;
  collateralToken: `0x${string}`;
  collateralSymbol: string;
  collateralDecimals: number;
  oracle: `0x${string}`;
  irm: `0x${string}`;
  lltv: bigint;
};

export const ETHEREUM_MORPHO_USDC_MARKET_MANIFEST_VERSION =
  "ethereum-morpho-usdc-2026-07-21-v1";

/**
 * Immutable Morpho Blue market parameters reviewed against the listed-market
 * registry. Runtime reads use only these IDs and the connected wallet provider.
 */
export const ethereumMorphoUsdcMarketsV1: readonly EthereumMorphoUsdcMarket[] =
  [
    {
      marketId:
        "0x94b823e6bd8ea533b4e33fbc307faea0b307301bc48763acc4d4aa4def7636cd",
      loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      loanSymbol: "USDC",
      loanDecimals: 6,
      collateralToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      collateralSymbol: "WETH",
      collateralDecimals: 18,
      oracle: "0x0F948CBa8231Db7898ef36A4212581Ad7b1B4580",
      irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
      lltv: 860_000_000_000_000_000n,
    },
  ];
