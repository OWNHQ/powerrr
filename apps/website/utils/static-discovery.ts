import {
  AAVE_V3_ORACLE,
  ETHEREUM_NATIVE_TOKEN,
  ETHEREUM_TOKEN_REGISTRY_SOURCE,
  ETHEREUM_TOKEN_REGISTRY_VERSION,
  SPARK_ORACLE,
  ethereumAssetMetadataByAddress,
  ethereumTokenRegistryV1,
  type EthereumTokenRegistryEntry,
} from "@powerrr/configs";
import type {
  BlockContext,
  DiscoveryProgress,
  HexAddress,
  PortfolioAsset,
  ReadReceipt,
} from "@powerrr/shared-types";
import {
  decodeFunctionResult,
  encodeFunctionData,
  formatUnits,
  getAddress,
  type Address,
  type Hex,
} from "viem";

export const MULTICALL3_ADDRESS =
  "0xcA11bde05977b3631167028862bE2a173976CA11" as const;
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as const;
const CHAINLINK_FEED_REGISTRY =
  "0x47Fb2585D2C56Fe188D0E6ec628a38b74fCeeeDf" as const;
const CHAINLINK_USD = "0x0000000000000000000000000000000000000348" as const;
const CHAINLINK_QUOTE_TOKEN_BY_SYMBOL = {
  ETH: WETH_ADDRESS,
  BTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" as const,
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as const,
  USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7" as const,
};
const UNISWAP_V3_FACTORY =
  "0x1F98431c8aD98523631AE4a59f267346ea31F984" as const;
const UNISWAP_V3_FEES = [100, 500, 3_000, 10_000] as const;
const UNISWAP_TWAP_SECONDS = 1_800;
const MIN_TWAP_LIQUIDITY_USD = 25_000;
// A direct USD valuation outside this range is not credible collateral data.
// This is deliberately generous (sub-picodollar through $1m per token) and
// prevents manipulated or abandoned pools near Uniswap's tick limits from
// dominating a wallet total.
const MIN_CREDIBLE_TOKEN_PRICE_USD = 1e-12;
const MAX_CREDIBLE_TOKEN_PRICE_USD = 1_000_000;
export const MAX_BLOCK_AGE_SECONDS = 300;

export type Eip1193Request = {
  method: string;
  params?: readonly unknown[] | object;
};

export type Eip1193Provider = {
  request<TResult = unknown>(request: Eip1193Request): Promise<TResult>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    listener: (...args: unknown[]) => void,
  ) => void;
};

export type StaticDiscoveryResult = {
  block: BlockContext;
  assets: PortfolioAsset[];
  receipt: ReadReceipt;
  registrySource: string;
};

type Call = { target: Address; allowFailure: boolean; callData: Hex };
type CallResult = { success: boolean; returnData: Hex };

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "value", type: "uint8" }],
  },
] as const;

const oracleAbi = [
  {
    type: "function",
    name: "BASE_CURRENCY_UNIT",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "unit", type: "uint256" }],
  },
  {
    type: "function",
    name: "getAssetPrice",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [{ name: "price", type: "uint256" }],
  },
] as const;

const chainlinkFeedRegistryAbi = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [
      { name: "base", type: "address" },
      { name: "quote", type: "address" },
    ],
    outputs: [{ name: "value", type: "uint8" }],
  },
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [
      { name: "base", type: "address" },
      { name: "quote", type: "address" },
    ],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;

const chainlinkAggregatorAbi = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "value", type: "uint8" }],
  },
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;

const erc4626PriceAbi = [
  ...erc20Abi,
  {
    type: "function",
    name: "asset",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "assetTokenAddress", type: "address" }],
  },
  {
    type: "function",
    name: "convertToAssets",
    stateMutability: "view",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ name: "assets", type: "uint256" }],
  },
] as const;

const contractRateAbi = [
  ...erc20Abi,
  ...(["exchangeRate", "getExchangeRate", "exchangeRateStored"] as const).map(
    (name) => ({
      type: "function" as const,
      name,
      stateMutability: "view" as const,
      inputs: [] as const,
      outputs: [{ name: "value", type: "uint256" as const }],
    }),
  ),
] as const;

const conversionRateAbi = [
  ...erc20Abi,
  {
    type: "function",
    name: "getWeETHByeETH",
    stateMutability: "view",
    inputs: [{ name: "eETHAmount", type: "uint256" }],
    outputs: [{ name: "weETHAmount", type: "uint256" }],
  },
] as const;

const uniswapFactoryAbi = [
  {
    type: "function",
    name: "getPool",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "fee", type: "uint24" },
    ],
    outputs: [{ name: "pool", type: "address" }],
  },
] as const;

const uniswapPoolAbi = [
  {
    type: "function",
    name: "observe",
    stateMutability: "view",
    inputs: [{ name: "secondsAgos", type: "uint32[]" }],
    outputs: [
      { name: "tickCumulatives", type: "int56[]" },
      {
        name: "secondsPerLiquidityCumulativeX128s",
        type: "uint160[]",
      },
    ],
  },
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "liquidity",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "value", type: "uint128" }],
  },
] as const;

const wstethAbi = [
  {
    type: "function",
    name: "getWstETHByStETH",
    stateMutability: "view",
    inputs: [{ name: "stETHAmount", type: "uint256" }],
    outputs: [{ name: "wstETHAmount", type: "uint256" }],
  },
] as const;

export type OnchainPriceResult = {
  priceUsd?: number;
  source?: string;
  reason?: string;
  confidence?: "high" | "medium" | "low";
  route?: string;
  observationSeconds?: number;
  liquidityUsd?: number;
};

export type EthereumTokenPriceAudit = {
  blockTag: Hex;
  blockTimestampSeconds: number;
  chunkSizes: number[];
  results: Array<{
    address: string;
    symbol: string;
    name: string;
    snapshotRank?: number;
    marketId?: string;
    price: OnchainPriceResult;
  }>;
};

const multicall3Abi = [
  {
    type: "function",
    name: "aggregate3",
    stateMutability: "payable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "allowFailure", type: "bool" },
          { name: "callData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      {
        name: "returnData",
        type: "tuple[]",
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" },
        ],
      },
    ],
  },
] as const;

const readOnlyMethods = new Set([
  "eth_requestAccounts",
  "eth_accounts",
  "eth_chainId",
  "wallet_switchEthereumChain",
  "eth_blockNumber",
  "eth_getBlockByNumber",
  "eth_getCode",
  "eth_getBalance",
  "eth_call",
]);

export function createReadOnlyProvider(
  provider: Eip1193Provider,
): Eip1193Provider {
  return {
    request: <TResult>(request: Eip1193Request) => {
      if (!readOnlyMethods.has(request.method)) {
        return Promise.reject(
          new Error(
            `Powerrr blocks non-read-only RPC method ${request.method}`,
          ),
        );
      }
      return provider.request<TResult>(request);
    },
    on: provider.on?.bind(provider),
    removeListener: provider.removeListener?.bind(provider),
  };
}

export async function scanConnectedWallet(input: {
  provider: Eip1193Provider;
  account: string;
  walletName: string;
  now?: Date;
  onProgress?: (progress: DiscoveryProgress) => void;
}): Promise<StaticDiscoveryResult> {
  const provider = createReadOnlyProvider(input.provider);
  const account = getAddress(input.account) as HexAddress;
  const now = input.now ?? new Date();
  const chainIdHex = await provider.request<string>({ method: "eth_chainId" });
  if (Number(BigInt(chainIdHex)) !== 1) {
    throw new Error("Switch your wallet to Ethereum Mainnet before scanning.");
  }

  const blockNumberHex = await provider.request<Hex>({
    method: "eth_blockNumber",
  });
  const block = await provider.request<{ timestamp?: Hex }>({
    method: "eth_getBlockByNumber",
    params: [blockNumberHex, false],
  });
  if (!block.timestamp) {
    throw new Error(
      "The wallet RPC did not return the pinned block timestamp.",
    );
  }
  const blockTimestamp = new Date(Number(BigInt(block.timestamp)) * 1_000);
  if (blockTimestamp.getTime() > now.getTime() + 60_000) {
    throw new Error(
      "The wallet RPC served a block timestamp more than one minute in the future.",
    );
  }
  const blockAgeSeconds = Math.max(
    0,
    Math.floor((now.getTime() - blockTimestamp.getTime()) / 1_000),
  );
  if (blockAgeSeconds > MAX_BLOCK_AGE_SECONDS) {
    throw new Error(
      `The wallet RPC served a block ${blockAgeSeconds} seconds old. Powerrr will not value collateral from a block older than five minutes.`,
    );
  }
  const blockNumber = String(BigInt(blockNumberHex));
  const code = await provider.request<Hex>({
    method: "eth_getCode",
    params: [MULTICALL3_ADDRESS, blockNumberHex],
  });
  if (!code || code === "0x") {
    throw new Error(
      "The canonical Multicall3 contract was not available through this wallet RPC.",
    );
  }

  input.onProgress?.({
    phase: "balances",
    completed: 0,
    total: ethereumTokenRegistryV1.length,
    message: `Reading ${ethereumTokenRegistryV1.length} ERC-20 balances in one Multicall3 request.`,
  });
  const balanceCalls = ethereumTokenRegistryV1.map((token) => ({
    target: token.address as Address,
    allowFailure: true,
    callData: encodeFunctionData({
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account as Address],
    }),
  }));
  const chunkSizes: number[] = [];
  const balanceResults = await multicallWithDeterministicRetry(
    provider,
    balanceCalls,
    blockNumberHex,
    chunkSizes,
  );
  const nativeBalanceHex = await provider.request<Hex>({
    method: "eth_getBalance",
    params: [account, blockNumberHex],
  });
  const nativeBalance = BigInt(nativeBalanceHex);
  const decodedBalances = ethereumTokenRegistryV1.map((token, index) => ({
    token,
    ...decodeBalance(balanceResults[index]),
  }));
  const positive = decodedBalances.filter(
    (item) => item.status === "success" && item.balanceRaw > 0n,
  );
  const decimalsResults = positive.length
    ? await multicallWithDeterministicRetry(
        provider,
        positive.map((item) => ({
          target: item.token.address as Address,
          allowFailure: true,
          callData: encodeFunctionData({
            abi: erc20Abi,
            functionName: "decimals",
          }),
        })),
        blockNumberHex,
        chunkSizes,
      )
    : [];
  const runtimeTokens = new Map<string, EthereumTokenRegistryEntry>();
  positive.forEach((item, index) => {
    const rawDecimals = decodeUint(decimalsResults[index], "decimals");
    if (rawDecimals === null || rawDecimals < 0n || rawDecimals > 255n) return;
    const decimals = Number(rawDecimals);
    if (decimals !== item.token.decimals) return;
    runtimeTokens.set(item.token.address.toLowerCase(), {
      ...item.token,
      decimals,
    });
  });
  const protocolConversions = await loadProtocolConversions(
    provider,
    positive,
    runtimeTokens,
    blockNumberHex,
  );
  input.onProgress?.({
    phase: "balances",
    completed: ethereumTokenRegistryV1.length,
    total: ethereumTokenRegistryV1.length,
    message: `Found ${positive.length} positive ERC-20 balances.`,
  });

  input.onProgress?.({
    phase: "valuation",
    completed: 0,
    total: positive.length + (nativeBalance > 0n ? 1 : 0),
    message: "Valuing positive balances from pinned onchain oracle routes.",
  });
  const prices = await loadPrices(
    provider,
    positive.flatMap((item) => {
      const token = runtimeTokens.get(item.token.address.toLowerCase());
      return token ? [token] : [];
    }),
    blockNumberHex,
    Number(BigInt(block.timestamp)),
    chunkSizes,
  );
  const assets: PortfolioAsset[] = decodedBalances.flatMap((item) => {
    if (item.status === "failed") {
      return [failedAsset(item.token, blockNumber)];
    }
    if (item.balanceRaw === 0n) return [];
    const runtimeToken = runtimeTokens.get(item.token.address.toLowerCase());
    if (!runtimeToken) {
      return [failedMetadataAsset(item.token, item.balanceRaw, blockNumber)];
    }
    const price = prices.get(runtimeToken.address.toLowerCase());
    return [
      portfolioAsset(
        runtimeToken,
        item.balanceRaw,
        blockNumber,
        price?.priceUsd,
        price?.source,
        price?.reason,
        price,
        protocolConversions.get(runtimeToken.address.toLowerCase()),
      ),
    ];
  });

  if (nativeBalance > 0n) {
    const wethPrice = prices.get("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
    assets.unshift({
      chainId: 1,
      token: ETHEREUM_NATIVE_TOKEN,
      symbol: "ETH",
      name: "Ether",
      decimals: 18,
      balance: formatUnits(nativeBalance, 18),
      balanceRaw: nativeBalance.toString(),
      protocolAssetToken: WETH_ADDRESS,
      protocolBalanceRaw: nativeBalance.toString(),
      conversionSnapshot: {
        sourceToken: ETHEREUM_NATIVE_TOKEN,
        targetToken: WETH_ADDRESS,
        sourceAmount: { raw: nativeBalance.toString(), decimals: 18 },
        targetAmount: { raw: nativeBalance.toString(), decimals: 18 },
        kind: "one-to-one",
        observedBlockNumber: blockNumber,
      },
      ...(wethPrice?.priceUsd ? { marketPriceUsd: wethPrice.priceUsd } : {}),
      priceStatus: wethPrice?.priceUsd ? "available" : "unavailable",
      protocolEligible: protocolEligibility(ETHEREUM_NATIVE_TOKEN),
      balanceReadStatus: "success",
      valuationStatus: wethPrice?.priceUsd ? "available" : "manual-review",
      valuationReason:
        wethPrice?.reason ??
        (wethPrice?.priceUsd ? undefined : "WETH oracle price unavailable."),
      ...(wethPrice?.source ? { priceProvenance: wethPrice.source } : {}),
      ...(wethPrice?.confidence
        ? { priceConfidence: wethPrice.confidence }
        : {}),
      ...(wethPrice?.route ? { priceRoute: wethPrice.route } : {}),
      ...(wethPrice?.observationSeconds
        ? { priceObservationSeconds: wethPrice.observationSeconds }
        : {}),
      ...(wethPrice?.liquidityUsd
        ? { priceLiquidityUsd: wethPrice.liquidityUsd }
        : {}),
      observedBlockNumber: blockNumber,
      assetKind: "native",
      requiredAction: "wrap",
    });
  }

  const succeeded = decodedBalances.filter(
    (item) => item.status === "success",
  ).length;
  const priceSources = [
    ...new Set(
      assets.flatMap((asset) =>
        asset.priceProvenance ? [asset.priceProvenance] : [],
      ),
    ),
  ];
  input.onProgress?.({
    phase: "complete",
    completed: assets.length,
    total: assets.length,
    message: "Wallet scan complete. Calculations remain in this browser tab.",
  });
  return {
    block: {
      chainId: 1,
      blockTag: blockNumberHex,
      blockNumber,
      blockTimestamp: blockTimestamp.toISOString(),
      blockAgeSeconds,
    },
    assets,
    registrySource: ETHEREUM_TOKEN_REGISTRY_SOURCE,
    receipt: {
      walletName: input.walletName,
      account,
      chainId: 1,
      blockNumber,
      blockTimestamp: blockTimestamp.toISOString(),
      blockAgeSeconds,
      registryVersion: ETHEREUM_TOKEN_REGISTRY_VERSION,
      multicallAddress: MULTICALL3_ADDRESS,
      callsAttempted: ethereumTokenRegistryV1.length,
      callsSucceeded: succeeded,
      callsFailed: ethereumTokenRegistryV1.length - succeeded,
      chunkSizes,
      priceSources,
      postedToPowerrr: false,
    },
  };
}

async function loadPrices(
  provider: Eip1193Provider,
  tokens: EthereumTokenRegistryEntry[],
  blockTag: Hex,
  blockTimestampSeconds: number,
  chunkSizes: number[],
): Promise<Map<string, OnchainPriceResult>> {
  tokens = expandPricingDependencies(tokens);
  const result = new Map<string, OnchainPriceResult>();
  const oracleTokens = tokens.filter(
    (token) => token.priceRoute.kind === "aave-oracle",
  );
  const weth = ethereumTokenRegistryV1.find((token) => token.symbol === "WETH");
  if (weth && !oracleTokens.some((token) => token.symbol === "WETH"))
    oracleTokens.push(weth);

  const oracles = [
    ...new Set(
      oracleTokens.flatMap((token) =>
        token.priceRoute.kind === "aave-oracle"
          ? [token.priceRoute.oracle.toLowerCase()]
          : [],
      ),
    ),
  ];
  const calls: Call[] = [
    ...oracles.map((oracle) => ({
      target: oracle as Address,
      allowFailure: true,
      callData: encodeFunctionData({
        abi: oracleAbi,
        functionName: "BASE_CURRENCY_UNIT",
      }),
    })),
    ...oracleTokens.map((token) => ({
      target: (token.priceRoute.kind === "aave-oracle"
        ? token.priceRoute.oracle
        : AAVE_V3_ORACLE) as Address,
      allowFailure: true,
      callData: encodeFunctionData({
        abi: oracleAbi,
        functionName: "getAssetPrice",
        args: [
          (token.priceRoute.kind === "aave-oracle"
            ? token.priceRoute.asset
            : token.address) as Address,
        ],
      }),
    })),
  ];
  const responses = await multicallWithDeterministicRetry(
    provider,
    calls,
    blockTag,
    chunkSizes,
  );
  const baseUnits = new Map<string, bigint>();
  oracles.forEach((oracle, index) => {
    const value = decodeUint(responses[index], "BASE_CURRENCY_UNIT");
    if (value && value > 0n) baseUnits.set(oracle, value);
  });
  oracleTokens.forEach((token, index) => {
    if (token.priceRoute.kind !== "aave-oracle") return;
    const raw = decodeUint(responses[oracles.length + index], "getAssetPrice");
    const unit = baseUnits.get(token.priceRoute.oracle.toLowerCase());
    if (!raw || !unit || raw <= 0n || unit <= 0n) {
      result.set(token.address.toLowerCase(), {
        reason: `${token.symbol} returned no valid price from its pinned protocol oracle.`,
      });
      return;
    }
    const priceUsd = Number(raw) / Number(unit);
    if (!isCredibleTokenPriceUsd(priceUsd)) {
      result.set(token.address.toLowerCase(), {
        reason: `${token.symbol} returned an implausible USD price from its pinned protocol oracle.`,
      });
      return;
    }
    result.set(token.address.toLowerCase(), {
      priceUsd,
      source: `Onchain oracle ${token.priceRoute.oracle}`,
      confidence: "high",
      route: `${token.symbol}/USD protocol oracle`,
    });
  });

  const directFeedTokens = tokens.filter(
    (token) =>
      token.priceRoute.kind === "chainlink-feed" &&
      !result.get(token.address.toLowerCase())?.priceUsd,
  );
  if (directFeedTokens.length) {
    await loadDirectChainlinkPrices(
      provider,
      directFeedTokens,
      blockTag,
      blockTimestampSeconds,
      chunkSizes,
      result,
    );
  }
  const automaticTokens = tokens.filter(
    (token) => !result.get(token.address.toLowerCase())?.priceUsd,
  );
  if (automaticTokens.length) {
    await loadTrustedProtocolOraclePrices(
      provider,
      automaticTokens,
      blockTag,
      chunkSizes,
      result,
    );
  }
  const chainlinkTokens = tokens.filter(
    (token) => !result.get(token.address.toLowerCase())?.priceUsd,
  );
  if (chainlinkTokens.length) {
    await loadChainlinkPrices(
      provider,
      chainlinkTokens,
      blockTag,
      blockTimestampSeconds,
      chunkSizes,
      result,
    );
  }
  const chainlinkEthTokens = tokens.filter(
    (token) => !result.get(token.address.toLowerCase())?.priceUsd,
  );
  if (chainlinkEthTokens.length) {
    await loadChainlinkEthPrices(
      provider,
      chainlinkEthTokens,
      blockTag,
      blockTimestampSeconds,
      chunkSizes,
      result,
    );
  }
  const dexTokens = tokens.filter(
    (token) => !result.get(token.address.toLowerCase())?.priceUsd,
  );
  if (dexTokens.length) {
    await loadUniswapPrices(provider, dexTokens, blockTag, chunkSizes, result);
  }
  const wrapperTokens = tokens.filter(
    (token) => token.priceRoute.kind === "erc4626-rate",
  );
  if (wrapperTokens.length) {
    await loadErc4626Prices(
      provider,
      wrapperTokens,
      blockTag,
      chunkSizes,
      result,
    );
  }
  const contractRateTokens = tokens.filter(
    (token) => token.priceRoute.kind === "contract-rate",
  );
  if (contractRateTokens.length) {
    await loadContractRatePrices(
      provider,
      contractRateTokens,
      blockTag,
      chunkSizes,
      result,
    );
  }
  const conversionRateTokens = tokens.filter(
    (token) => token.priceRoute.kind === "conversion-rate",
  );
  if (conversionRateTokens.length) {
    await loadConversionRatePrices(
      provider,
      conversionRateTokens,
      blockTag,
      chunkSizes,
      result,
    );
  }
  for (const token of tokens) {
    if (!result.get(token.address.toLowerCase())?.priceUsd) {
      result.set(token.address.toLowerCase(), {
        reason: `${token.symbol} has no fresh reviewed oracle, exact wrapper rate, or sufficiently liquid Uniswap V3 route at the pinned block.`,
      });
    }
  }
  return result;
}

function expandPricingDependencies(
  tokens: EthereumTokenRegistryEntry[],
): EthereumTokenRegistryEntry[] {
  const byAddress = new Map(
    ethereumTokenRegistryV1.map((token) => [
      token.address.toLowerCase(),
      token,
    ]),
  );
  const expanded = [...tokens];
  const seen = new Set(tokens.map((token) => token.address.toLowerCase()));
  for (let index = 0; index < expanded.length; index += 1) {
    const token = expanded[index]!;
    if (
      token.priceRoute.kind === "chainlink-feed" &&
      token.priceRoute.quote !== "USD"
    ) {
      const quoteAddress =
        CHAINLINK_QUOTE_TOKEN_BY_SYMBOL[token.priceRoute.quote];
      const key = quoteAddress.toLowerCase();
      const quoteToken = byAddress.get(key);
      if (quoteToken && !seen.has(key)) {
        seen.add(key);
        expanded.push(quoteToken);
      }
      continue;
    }
    if (
      token.priceRoute.kind !== "erc4626-rate" &&
      token.priceRoute.kind !== "contract-rate" &&
      token.priceRoute.kind !== "conversion-rate"
    )
      continue;
    const key = token.priceRoute.underlying.toLowerCase();
    const underlying = byAddress.get(key);
    if (!underlying || seen.has(key)) continue;
    seen.add(key);
    expanded.push(underlying);
  }
  return expanded;
}

async function loadConversionRatePrices(
  provider: Eip1193Provider,
  tokens: EthereumTokenRegistryEntry[],
  blockTag: Hex,
  chunkSizes: number[],
  output: Map<string, OnchainPriceResult>,
): Promise<void> {
  const registryByAddress = new Map(
    ethereumTokenRegistryV1.map((token) => [
      token.address.toLowerCase(),
      token,
    ]),
  );
  const calls: Call[] = tokens.flatMap((token) => {
    if (token.priceRoute.kind !== "conversion-rate") return [];
    return [
      {
        target: token.address as Address,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: conversionRateAbi,
          functionName: "decimals",
        }),
      },
      {
        target: token.priceRoute.underlying as Address,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: conversionRateAbi,
          functionName: "decimals",
        }),
      },
      {
        target: token.priceRoute.conversionContract as Address,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: conversionRateAbi,
          functionName: token.priceRoute.method,
          args: [10n ** BigInt(token.decimals)],
        }),
      },
    ];
  });
  const responses = await multicallWithDeterministicRetry(
    provider,
    calls,
    blockTag,
    chunkSizes,
  );
  tokens.forEach((token, index) => {
    if (token.priceRoute.kind !== "conversion-rate") return;
    try {
      const tokenDecimals = decodeUint(responses[index * 3], "decimals");
      const underlyingDecimals = decodeUint(
        responses[index * 3 + 1],
        "decimals",
      );
      const conversionResponse = responses[index * 3 + 2];
      if (
        tokenDecimals === null ||
        underlyingDecimals === null ||
        !conversionResponse?.success
      )
        return;
      const convertedRaw = decodeFunctionResult({
        abi: conversionRateAbi,
        functionName: token.priceRoute.method,
        data: conversionResponse.returnData,
      });
      const underlying = registryByAddress.get(
        token.priceRoute.underlying.toLowerCase(),
      );
      if (
        Number(tokenDecimals) !== token.decimals ||
        !underlying ||
        Number(underlyingDecimals) !== underlying.decimals ||
        convertedRaw <= 0n
      )
        return;
      const underlyingPrice = output.get(
        token.priceRoute.underlying.toLowerCase(),
      );
      if (!underlyingPrice?.priceUsd) return;
      const priceUsd =
        (Number(convertedRaw) / 10 ** underlying.decimals) *
        underlyingPrice.priceUsd;
      if (!isCredibleTokenPriceUsd(priceUsd)) return;
      output.set(token.address.toLowerCase(), {
        priceUsd,
        source: `${token.priceRoute.method} conversion ${token.priceRoute.conversionContract}; underlying ${underlyingPrice.source ?? token.priceRoute.underlying}`,
        confidence: underlyingPrice.confidence ?? "medium",
        route: `${token.symbol}/${underlying.symbol} exact wrapper conversion`,
      });
    } catch {
      // An invalid reviewed conversion remains unavailable.
    }
  });
}

async function loadContractRatePrices(
  provider: Eip1193Provider,
  tokens: EthereumTokenRegistryEntry[],
  blockTag: Hex,
  chunkSizes: number[],
  output: Map<string, OnchainPriceResult>,
): Promise<void> {
  const registryByAddress = new Map(
    ethereumTokenRegistryV1.map((token) => [
      token.address.toLowerCase(),
      token,
    ]),
  );
  const calls: Call[] = tokens.flatMap((token) => {
    if (token.priceRoute.kind !== "contract-rate") return [];
    return [
      {
        target: token.address as Address,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: contractRateAbi,
          functionName: "decimals",
        }),
      },
      {
        target: token.priceRoute.underlying as Address,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: contractRateAbi,
          functionName: "decimals",
        }),
      },
      {
        target: token.address as Address,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: contractRateAbi,
          functionName: token.priceRoute.method,
        }),
      },
    ];
  });
  const responses = await multicallWithDeterministicRetry(
    provider,
    calls,
    blockTag,
    chunkSizes,
  );
  tokens.forEach((token, index) => {
    if (token.priceRoute.kind !== "contract-rate") return;
    try {
      const tokenDecimalsResult = responses[index * 3];
      const underlyingDecimalsResult = responses[index * 3 + 1];
      const rateResult = responses[index * 3 + 2];
      if (
        !tokenDecimalsResult?.success ||
        !underlyingDecimalsResult?.success ||
        !rateResult?.success
      )
        return;
      const tokenDecimals = Number(
        decodeFunctionResult({
          abi: contractRateAbi,
          functionName: "decimals",
          data: tokenDecimalsResult.returnData,
        }),
      );
      const underlyingDecimals = Number(
        decodeFunctionResult({
          abi: contractRateAbi,
          functionName: "decimals",
          data: underlyingDecimalsResult.returnData,
        }),
      );
      const rate = decodeFunctionResult({
        abi: contractRateAbi,
        functionName: token.priceRoute.method,
        data: rateResult.returnData,
      }) as unknown as bigint;
      const underlying = registryByAddress.get(
        token.priceRoute.underlying.toLowerCase(),
      );
      const scale = BigInt(token.priceRoute.rateScale);
      if (
        tokenDecimals !== token.decimals ||
        !underlying ||
        underlyingDecimals !== underlying.decimals ||
        rate <= 0n ||
        scale <= 0n
      )
        return;
      const underlyingPrice = output.get(
        token.priceRoute.underlying.toLowerCase(),
      );
      if (!underlyingPrice?.priceUsd) return;
      const priceUsd =
        (Number(rate) / Number(scale)) * underlyingPrice.priceUsd;
      if (!isCredibleTokenPriceUsd(priceUsd)) return;
      output.set(token.address.toLowerCase(), {
        priceUsd,
        source: `${token.priceRoute.method} rate ${token.address}; underlying ${underlyingPrice.source ?? token.priceRoute.underlying}`,
        confidence: underlyingPrice.confidence ?? "medium",
        route: `${token.symbol}/${underlying.symbol} exact contract rate`,
      });
    } catch {
      // A failed or malformed reviewed exchange-rate call remains unavailable.
    }
  });
}

async function loadErc4626Prices(
  provider: Eip1193Provider,
  tokens: EthereumTokenRegistryEntry[],
  blockTag: Hex,
  chunkSizes: number[],
  output: Map<string, OnchainPriceResult>,
): Promise<void> {
  const registryByAddress = new Map(
    ethereumTokenRegistryV1.map((token) => [
      token.address.toLowerCase(),
      token,
    ]),
  );
  const calls: Call[] = tokens.flatMap((token) => {
    if (token.priceRoute.kind !== "erc4626-rate") return [];
    return [
      {
        target: token.address as Address,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: erc4626PriceAbi,
          functionName: "decimals",
        }),
      },
      {
        target: token.address as Address,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: erc4626PriceAbi,
          functionName: "asset",
        }),
      },
      {
        target: token.address as Address,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: erc4626PriceAbi,
          functionName: "convertToAssets",
          args: [10n ** BigInt(token.decimals)],
        }),
      },
      {
        target: token.priceRoute.underlying as Address,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: erc4626PriceAbi,
          functionName: "decimals",
        }),
      },
    ];
  });
  const responses = await multicallWithDeterministicRetry(
    provider,
    calls,
    blockTag,
    chunkSizes,
  );
  tokens.forEach((token, index) => {
    if (token.priceRoute.kind !== "erc4626-rate") return;
    try {
      const wrapperDecimalsResult = responses[index * 4];
      const assetResult = responses[index * 4 + 1];
      const conversionResult = responses[index * 4 + 2];
      const underlyingDecimalsResult = responses[index * 4 + 3];
      if (
        !wrapperDecimalsResult?.success ||
        !assetResult?.success ||
        !conversionResult?.success ||
        !underlyingDecimalsResult?.success
      ) {
        return;
      }
      const wrapperDecimals = Number(
        decodeFunctionResult({
          abi: erc4626PriceAbi,
          functionName: "decimals",
          data: wrapperDecimalsResult.returnData,
        }),
      );
      const underlyingAddress = decodeFunctionResult({
        abi: erc4626PriceAbi,
        functionName: "asset",
        data: assetResult.returnData,
      });
      const convertedRaw = decodeFunctionResult({
        abi: erc4626PriceAbi,
        functionName: "convertToAssets",
        data: conversionResult.returnData,
      });
      const underlyingDecimals = Number(
        decodeFunctionResult({
          abi: erc4626PriceAbi,
          functionName: "decimals",
          data: underlyingDecimalsResult.returnData,
        }),
      );
      const expectedUnderlying = registryByAddress.get(
        token.priceRoute.underlying.toLowerCase(),
      );
      if (
        wrapperDecimals !== token.decimals ||
        underlyingAddress.toLowerCase() !==
          token.priceRoute.underlying.toLowerCase() ||
        !expectedUnderlying ||
        underlyingDecimals !== expectedUnderlying.decimals ||
        convertedRaw <= 0n
      ) {
        return;
      }
      const underlyingPrice = output.get(
        token.priceRoute.underlying.toLowerCase(),
      );
      if (!underlyingPrice?.priceUsd) return;
      const priceUsd =
        (Number(convertedRaw) / 10 ** underlyingDecimals) *
        underlyingPrice.priceUsd;
      if (!isCredibleTokenPriceUsd(priceUsd)) return;
      output.set(token.address.toLowerCase(), {
        priceUsd,
        source: `ERC-4626 redemption rate ${token.address}; underlying ${underlyingPrice.source ?? token.priceRoute.underlying}`,
        confidence: underlyingPrice.confidence ?? "medium",
        route: `${token.symbol}/${expectedUnderlying.symbol} exact share rate`,
      });
    } catch {
      // A mismatched asset, decimals value, or failed redemption quote is not
      // replaced with a nominal peg or cached wrapper ratio.
    }
  });
}

async function loadDirectChainlinkPrices(
  provider: Eip1193Provider,
  tokens: EthereumTokenRegistryEntry[],
  blockTag: Hex,
  blockTimestampSeconds: number,
  chunkSizes: number[],
  output: Map<string, OnchainPriceResult>,
): Promise<void> {
  const calls: Call[] = tokens.flatMap((token) => {
    if (token.priceRoute.kind !== "chainlink-feed") return [];
    return [
      {
        target: token.priceRoute.feed as Address,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: chainlinkAggregatorAbi,
          functionName: "decimals",
        }),
      },
      {
        target: token.priceRoute.feed as Address,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: chainlinkAggregatorAbi,
          functionName: "latestRoundData",
        }),
      },
    ];
  });
  const responses = await multicallWithDeterministicRetry(
    provider,
    calls,
    blockTag,
    chunkSizes,
  );
  tokens.forEach((token, index) => {
    if (token.priceRoute.kind !== "chainlink-feed") return;
    try {
      const decimalsResult = responses[index * 2];
      const roundResult = responses[index * 2 + 1];
      if (!decimalsResult?.success || !roundResult?.success) return;
      const decimals = decodeFunctionResult({
        abi: chainlinkAggregatorAbi,
        functionName: "decimals",
        data: decimalsResult.returnData,
      });
      const round = decodeFunctionResult({
        abi: chainlinkAggregatorAbi,
        functionName: "latestRoundData",
        data: roundResult.returnData,
      });
      const roundId = round[0];
      const answer = round[1];
      const updatedAt = Number(round[3]);
      const answeredInRound = round[4];
      const ageSeconds = blockTimestampSeconds - updatedAt;
      // Allow a small delivery margin beyond the published heartbeat, while
      // still failing closed instead of accepting an indefinitely stale feed.
      const maxAgeSeconds = token.priceRoute.heartbeatSeconds + 15 * 60;
      if (
        roundId <= 0n ||
        answer <= 0n ||
        updatedAt <= 0 ||
        answeredInRound < roundId ||
        !Number.isFinite(ageSeconds) ||
        ageSeconds < 0 ||
        ageSeconds > maxAgeSeconds
      ) {
        return;
      }
      const quoteAddress =
        token.priceRoute.quote === "USD"
          ? undefined
          : CHAINLINK_QUOTE_TOKEN_BY_SYMBOL[token.priceRoute.quote];
      const quotePrice = quoteAddress
        ? output.get(quoteAddress.toLowerCase())
        : undefined;
      if (quoteAddress && !quotePrice?.priceUsd) return;
      const priceUsd =
        (Number(answer) / 10 ** Number(decimals)) * (quotePrice?.priceUsd ?? 1);
      if (!isCredibleTokenPriceUsd(priceUsd)) return;
      output.set(token.address.toLowerCase(), {
        priceUsd,
        source: `Chainlink direct feed ${token.priceRoute.feed}${quotePrice?.source ? `; quote ${quotePrice.source}` : ""}`,
        confidence: quotePrice?.confidence ?? "high",
        route: `${token.symbol}/${token.priceRoute.quote} Chainlink feed`,
      });
    } catch {
      // A stale or malformed configured feed fails closed; trusted protocol
      // oracles and TWAP routes may still appraise the token at this block.
    }
  });
}

async function loadTrustedProtocolOraclePrices(
  provider: Eip1193Provider,
  tokens: EthereumTokenRegistryEntry[],
  blockTag: Hex,
  chunkSizes: number[],
  output: Map<string, OnchainPriceResult>,
): Promise<void> {
  const trustedOracles = [
    { address: AAVE_V3_ORACLE, label: "Aave Ethereum Core V3 oracle" },
    { address: SPARK_ORACLE, label: "SparkLend Ethereum oracle" },
  ] as const;
  const calls: Call[] = [
    ...trustedOracles.map((oracle) => ({
      target: oracle.address as Address,
      allowFailure: true,
      callData: encodeFunctionData({
        abi: oracleAbi,
        functionName: "BASE_CURRENCY_UNIT",
      }),
    })),
    ...trustedOracles.flatMap((oracle) =>
      tokens.map((token) => ({
        target: oracle.address as Address,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: oracleAbi,
          functionName: "getAssetPrice",
          args: [token.address as Address],
        }),
      })),
    ),
  ];
  const responses = await multicallWithDeterministicRetry(
    provider,
    calls,
    blockTag,
    chunkSizes,
  );
  const baseUnits = trustedOracles.map((_, index) =>
    decodeUint(responses[index], "BASE_CURRENCY_UNIT"),
  );
  trustedOracles.forEach((oracle, oracleIndex) => {
    const unit = baseUnits[oracleIndex];
    if (!unit || unit <= 0n) return;
    tokens.forEach((token, tokenIndex) => {
      const key = token.address.toLowerCase();
      if (output.get(key)?.priceUsd) return;
      const responseIndex =
        trustedOracles.length + oracleIndex * tokens.length + tokenIndex;
      const raw = decodeUint(responses[responseIndex], "getAssetPrice");
      if (!raw || raw <= 0n) return;
      const priceUsd = Number(raw) / Number(unit);
      if (!isCredibleTokenPriceUsd(priceUsd)) return;
      output.set(key, {
        priceUsd,
        source: `${oracle.label} ${oracle.address}`,
        confidence: "high",
        route: `${token.symbol}/USD protocol oracle`,
      });
    });
  });
}

/**
 * Replays the production price hierarchy for the complete checked-in registry.
 * This is tooling-only in practice, but lives beside the pricing implementation
 * so audits cannot silently drift from the wallet scan's actual route logic.
 */
export async function auditEthereumTokenPricesAtBlock(input: {
  provider: Eip1193Provider;
  blockTag: Hex;
  blockTimestampSeconds: number;
}): Promise<EthereumTokenPriceAudit> {
  const chunkSizes: number[] = [];
  const prices = await loadPrices(
    createReadOnlyProvider(input.provider),
    [...ethereumTokenRegistryV1],
    input.blockTag,
    input.blockTimestampSeconds,
    chunkSizes,
  );
  return {
    blockTag: input.blockTag,
    blockTimestampSeconds: input.blockTimestampSeconds,
    chunkSizes,
    results: ethereumTokenRegistryV1.map((token) => ({
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      ...(token.snapshotRank ? { snapshotRank: token.snapshotRank } : {}),
      ...(token.marketId ? { marketId: token.marketId } : {}),
      price: prices.get(token.address.toLowerCase()) ?? {
        reason: `${token.symbol} was not evaluated.`,
      },
    })),
  };
}

async function loadProtocolConversions(
  provider: Eip1193Provider,
  positive: Array<{
    token: EthereumTokenRegistryEntry;
    status: "success" | "failed";
    balanceRaw: bigint;
  }>,
  runtimeTokens: Map<string, EthereumTokenRegistryEntry>,
  blockTag: Hex,
): Promise<Map<string, bigint>> {
  const converted = new Map<string, bigint>();
  await Promise.all(
    positive.map(async (item) => {
      const key = item.token.address.toLowerCase();
      if (!runtimeTokens.has(key)) return;
      const metadata = ethereumAssetMetadataByAddress(item.token.address);
      if (
        metadata?.conversion?.kind !== "wsteth" ||
        !metadata.conversion.contract
      ) {
        return;
      }
      try {
        const data = encodeFunctionData({
          abi: wstethAbi,
          functionName: "getWstETHByStETH",
          args: [item.balanceRaw],
        });
        const response = await provider.request<Hex>({
          method: "eth_call",
          params: [{ to: metadata.conversion.contract, data }, blockTag],
        });
        const amount = decodeFunctionResult({
          abi: wstethAbi,
          functionName: "getWstETHByStETH",
          data: response,
        });
        converted.set(key, amount);
      } catch {
        // Conversion-dependent collateral fails closed while the wallet asset
        // remains visible with its independently sourced valuation.
      }
    }),
  );
  return converted;
}

async function loadChainlinkPrices(
  provider: Eip1193Provider,
  tokens: EthereumTokenRegistryEntry[],
  blockTag: Hex,
  blockTimestampSeconds: number,
  chunkSizes: number[],
  output: Map<string, OnchainPriceResult>,
): Promise<void> {
  const calls: Call[] = tokens.flatMap((token) => [
    {
      target: CHAINLINK_FEED_REGISTRY,
      allowFailure: true,
      callData: encodeFunctionData({
        abi: chainlinkFeedRegistryAbi,
        functionName: "decimals",
        args: [token.address as Address, CHAINLINK_USD],
      }),
    },
    {
      target: CHAINLINK_FEED_REGISTRY,
      allowFailure: true,
      callData: encodeFunctionData({
        abi: chainlinkFeedRegistryAbi,
        functionName: "latestRoundData",
        args: [token.address as Address, CHAINLINK_USD],
      }),
    },
  ]);
  const responses = await multicallWithDeterministicRetry(
    provider,
    calls,
    blockTag,
    chunkSizes,
  );
  tokens.forEach((token, index) => {
    try {
      const decimalsResult = responses[index * 2];
      const roundResult = responses[index * 2 + 1];
      if (!decimalsResult?.success || !roundResult?.success) return;
      const decimals = decodeFunctionResult({
        abi: chainlinkFeedRegistryAbi,
        functionName: "decimals",
        data: decimalsResult.returnData,
      });
      const round = decodeFunctionResult({
        abi: chainlinkFeedRegistryAbi,
        functionName: "latestRoundData",
        data: roundResult.returnData,
      });
      const roundId = round[0];
      const answer = round[1];
      const updatedAt = Number(round[3]);
      const answeredInRound = round[4];
      const ageSeconds = blockTimestampSeconds - updatedAt;
      if (
        roundId <= 0n ||
        answer <= 0n ||
        updatedAt <= 0 ||
        answeredInRound < roundId ||
        !Number.isFinite(ageSeconds) ||
        ageSeconds < 0 ||
        ageSeconds > 36 * 60 * 60
      ) {
        return;
      }
      const priceUsd = Number(answer) / 10 ** Number(decimals);
      if (!isCredibleTokenPriceUsd(priceUsd)) return;
      output.set(token.address.toLowerCase(), {
        priceUsd,
        source: `Chainlink Feed Registry ${CHAINLINK_FEED_REGISTRY}`,
        confidence: "high",
        route: `${token.symbol}/USD Chainlink feed`,
      });
    } catch {
      // A missing feed is an expected route miss; Uniswap is attempted next.
    }
  });
}

async function loadChainlinkEthPrices(
  provider: Eip1193Provider,
  tokens: EthereumTokenRegistryEntry[],
  blockTag: Hex,
  blockTimestampSeconds: number,
  chunkSizes: number[],
  output: Map<string, OnchainPriceResult>,
): Promise<void> {
  const wethPrice = output.get(WETH_ADDRESS.toLowerCase());
  if (!wethPrice?.priceUsd) return;
  const calls: Call[] = tokens.flatMap((token) => [
    {
      target: CHAINLINK_FEED_REGISTRY,
      allowFailure: true,
      callData: encodeFunctionData({
        abi: chainlinkFeedRegistryAbi,
        functionName: "decimals",
        args: [token.address as Address, ETHEREUM_NATIVE_TOKEN as Address],
      }),
    },
    {
      target: CHAINLINK_FEED_REGISTRY,
      allowFailure: true,
      callData: encodeFunctionData({
        abi: chainlinkFeedRegistryAbi,
        functionName: "latestRoundData",
        args: [token.address as Address, ETHEREUM_NATIVE_TOKEN as Address],
      }),
    },
  ]);
  const responses = await multicallWithDeterministicRetry(
    provider,
    calls,
    blockTag,
    chunkSizes,
  );
  tokens.forEach((token, index) => {
    try {
      const decimalsResult = responses[index * 2];
      const roundResult = responses[index * 2 + 1];
      if (!decimalsResult?.success || !roundResult?.success) return;
      const decimals = decodeFunctionResult({
        abi: chainlinkFeedRegistryAbi,
        functionName: "decimals",
        data: decimalsResult.returnData,
      });
      const round = decodeFunctionResult({
        abi: chainlinkFeedRegistryAbi,
        functionName: "latestRoundData",
        data: roundResult.returnData,
      });
      const roundId = round[0];
      const answer = round[1];
      const updatedAt = Number(round[3]);
      const answeredInRound = round[4];
      const ageSeconds = blockTimestampSeconds - updatedAt;
      if (
        roundId <= 0n ||
        answer <= 0n ||
        updatedAt <= 0 ||
        answeredInRound < roundId ||
        !Number.isFinite(ageSeconds) ||
        ageSeconds < 0 ||
        ageSeconds > 36 * 60 * 60
      )
        return;
      const ethPerToken = Number(answer) / 10 ** Number(decimals);
      const priceUsd = ethPerToken * wethPrice.priceUsd!;
      if (!isCredibleTokenPriceUsd(priceUsd)) return;
      output.set(token.address.toLowerCase(), {
        priceUsd,
        source: `Chainlink Feed Registry ${CHAINLINK_FEED_REGISTRY}; ETH quote ${wethPrice.source ?? WETH_ADDRESS}`,
        confidence: wethPrice.confidence ?? "high",
        route: `${token.symbol}/ETH Chainlink feed`,
      });
    } catch {
      // A missing ETH-denominated feed is an expected route miss.
    }
  });
}

async function loadUniswapPrices(
  provider: Eip1193Provider,
  tokens: EthereumTokenRegistryEntry[],
  blockTag: Hex,
  chunkSizes: number[],
  output: Map<string, OnchainPriceResult>,
): Promise<void> {
  const quoteTokens = ethereumTokenRegistryV1.filter(
    (token) =>
      ["WETH", "USDC", "USDT", "DAI"].includes(token.symbol) &&
      Boolean(output.get(token.address.toLowerCase())?.priceUsd),
  );
  const routes = tokens.flatMap((token) =>
    quoteTokens
      .filter(
        (quote) => quote.address.toLowerCase() !== token.address.toLowerCase(),
      )
      .flatMap((quote) =>
        UNISWAP_V3_FEES.map((fee) => ({ token, quote, fee })),
      ),
  );
  if (!routes.length) return;
  const poolResults = await multicallWithDeterministicRetry(
    provider,
    routes.map((route) => ({
      target: UNISWAP_V3_FACTORY,
      allowFailure: true,
      callData: encodeFunctionData({
        abi: uniswapFactoryAbi,
        functionName: "getPool",
        args: [
          route.token.address as Address,
          route.quote.address as Address,
          route.fee,
        ],
      }),
    })),
    blockTag,
    chunkSizes,
  );
  const pools = routes.flatMap((route, index) => {
    const response = poolResults[index];
    if (!response?.success) return [];
    try {
      const pool = decodeFunctionResult({
        abi: uniswapFactoryAbi,
        functionName: "getPool",
        data: response.returnData,
      });
      return /^0x0{40}$/i.test(pool) ? [] : [{ ...route, pool }];
    } catch {
      return [];
    }
  });
  if (!pools.length) return;
  const stateResults = await multicallWithDeterministicRetry(
    provider,
    pools.flatMap((route) => [
      {
        target: route.pool,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: uniswapPoolAbi,
          functionName: "observe",
          args: [[UNISWAP_TWAP_SECONDS, 0]],
        }),
      },
      {
        target: route.pool,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: uniswapPoolAbi,
          functionName: "slot0",
        }),
      },
      {
        target: route.pool,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: uniswapPoolAbi,
          functionName: "liquidity",
        }),
      },
    ]),
    blockTag,
    chunkSizes,
  );
  const candidates = pools.flatMap((route, index) => {
    const observeResult = stateResults[index * 3];
    const slotResult = stateResults[index * 3 + 1];
    const liquidityResult = stateResults[index * 3 + 2];
    if (
      !observeResult?.success ||
      !slotResult?.success ||
      !liquidityResult?.success
    )
      return [];
    try {
      const slot = decodeFunctionResult({
        abi: uniswapPoolAbi,
        functionName: "slot0",
        data: slotResult.returnData,
      });
      const currentLiquidity = decodeFunctionResult({
        abi: uniswapPoolAbi,
        functionName: "liquidity",
        data: liquidityResult.returnData,
      });
      let tick = Number(slot[1]);
      let routeLiquidity = currentLiquidity;
      const observed = decodeFunctionResult({
        abi: uniswapPoolAbi,
        functionName: "observe",
        data: observeResult.returnData,
      });
      const tickDelta = observed[0][1]! - observed[0][0]!;
      tick = floorDiv(tickDelta, BigInt(UNISWAP_TWAP_SECONDS));
      const liquidityDelta = observed[1][1]! - observed[1][0]!;
      if (liquidityDelta > 0n) {
        routeLiquidity =
          (BigInt(UNISWAP_TWAP_SECONDS) << 128n) / liquidityDelta;
      }
      const confidence = "medium" as const;
      const observationSeconds = UNISWAP_TWAP_SECONDS;
      const quoteUsd = output.get(route.quote.address.toLowerCase())?.priceUsd;
      if (!quoteUsd) return [];
      const quotePerToken = quotePerBaseFromTick(
        tick,
        route.token,
        route.quote,
      );
      const priceUsd = quotePerToken * quoteUsd;
      const liquidityUsd = estimateQuoteLiquidityUsd(
        routeLiquidity,
        slot[0],
        route.token,
        route.quote,
        quoteUsd,
      );
      if (
        !isCredibleTokenPriceUsd(priceUsd) ||
        !Number.isFinite(liquidityUsd) ||
        liquidityUsd < MIN_TWAP_LIQUIDITY_USD
      ) {
        return [];
      }
      return [
        {
          token: route.token,
          quote: route.quote,
          fee: route.fee,
          priceUsd,
          liquidityUsd,
          confidence,
          observationSeconds,
        },
      ];
    } catch {
      return [];
    }
  });
  for (const token of tokens) {
    const best = candidates
      .filter(
        (candidate) =>
          candidate.token.address.toLowerCase() === token.address.toLowerCase(),
      )
      .sort((left, right) => {
        if (left.confidence !== right.confidence)
          return left.confidence === "medium" ? -1 : 1;
        return right.liquidityUsd - left.liquidityUsd;
      })[0];
    if (!best) continue;
    output.set(token.address.toLowerCase(), {
      priceUsd: best.priceUsd,
      source: "Uniswap V3 30-minute TWAP",
      confidence: best.confidence,
      route: `${token.symbol}/${best.quote.symbol} ${best.fee / 10_000}% pool`,
      ...(best.observationSeconds
        ? { observationSeconds: best.observationSeconds }
        : {}),
      liquidityUsd: best.liquidityUsd,
    });
  }
}

export function isCredibleTokenPriceUsd(priceUsd: number): boolean {
  return (
    Number.isFinite(priceUsd) &&
    priceUsd >= MIN_CREDIBLE_TOKEN_PRICE_USD &&
    priceUsd <= MAX_CREDIBLE_TOKEN_PRICE_USD
  );
}

function floorDiv(numerator: bigint, denominator: bigint): number {
  let quotient = numerator / denominator;
  if (numerator < 0n && numerator % denominator !== 0n) quotient -= 1n;
  return Number(quotient);
}

function quotePerBaseFromTick(
  tick: number,
  base: EthereumTokenRegistryEntry,
  quote: EthereumTokenRegistryEntry,
): number {
  const rawToken1PerToken0 = Math.pow(1.0001, tick);
  const baseIsToken0 = BigInt(base.address) < BigInt(quote.address);
  const rawQuotePerBase = baseIsToken0
    ? rawToken1PerToken0
    : 1 / rawToken1PerToken0;
  return rawQuotePerBase * 10 ** (base.decimals - quote.decimals);
}

function estimateQuoteLiquidityUsd(
  liquidity: bigint,
  sqrtPriceX96: bigint,
  base: EthereumTokenRegistryEntry,
  quote: EthereumTokenRegistryEntry,
  quoteUsd: number,
): number {
  if (liquidity <= 0n || sqrtPriceX96 <= 0n) return 0;
  const q96 = 2 ** 96;
  const baseIsToken0 = BigInt(base.address) < BigInt(quote.address);
  const quoteRaw = baseIsToken0
    ? Number(liquidity) * (Number(sqrtPriceX96) / q96)
    : Number(liquidity) * (q96 / Number(sqrtPriceX96));
  return (quoteRaw / 10 ** quote.decimals) * quoteUsd;
}

async function multicallWithDeterministicRetry(
  provider: Eip1193Provider,
  calls: Call[],
  blockTag: Hex,
  chunkSizes: number[],
): Promise<CallResult[]> {
  if (!calls.length) return [];
  try {
    chunkSizes.push(calls.length);
    return await executeMulticall(provider, calls, blockTag);
  } catch {
    if (calls.length <= 25) {
      return calls.map(() => ({ success: false, returnData: "0x" }));
    }
    const size = calls.length > 50 ? 50 : 25;
    const output: CallResult[] = [];
    for (let index = 0; index < calls.length; index += size) {
      output.push(
        ...(await multicallWithDeterministicRetry(
          provider,
          calls.slice(index, index + size),
          blockTag,
          chunkSizes,
        )),
      );
    }
    return output;
  }
}

async function executeMulticall(
  provider: Eip1193Provider,
  calls: Call[],
  blockTag: Hex,
): Promise<CallResult[]> {
  const data = encodeFunctionData({
    abi: multicall3Abi,
    functionName: "aggregate3",
    args: [calls],
  });
  const response = await provider.request<Hex>({
    method: "eth_call",
    params: [{ to: MULTICALL3_ADDRESS, data }, blockTag],
  });
  const decoded = decodeFunctionResult({
    abi: multicall3Abi,
    functionName: "aggregate3",
    data: response,
  });
  return decoded.map((item) => ({
    success: item.success,
    returnData: item.returnData,
  }));
}

function decodeBalance(
  result: CallResult | undefined,
):
  | { status: "success"; balanceRaw: bigint }
  | { status: "failed"; balanceRaw: 0n } {
  const decoded = decodeUint(result, "balanceOf");
  return decoded === null
    ? { status: "failed", balanceRaw: 0n }
    : { status: "success", balanceRaw: decoded };
}

function decodeUint(
  result: CallResult | undefined,
  functionName:
    "balanceOf" | "decimals" | "BASE_CURRENCY_UNIT" | "getAssetPrice",
): bigint | null {
  if (!result?.success || !/^0x[0-9a-fA-F]{64}$/.test(result.returnData)) {
    return null;
  }
  try {
    return decodeFunctionResult({
      abi:
        functionName === "balanceOf" || functionName === "decimals"
          ? erc20Abi
          : oracleAbi,
      functionName,
      data: result.returnData,
    }) as bigint;
  } catch {
    return null;
  }
}

function failedMetadataAsset(
  token: EthereumTokenRegistryEntry,
  balanceRaw: bigint,
  blockNumber: string,
): PortfolioAsset {
  return {
    ...portfolioAsset(token, balanceRaw, blockNumber),
    priceStatus: "unavailable",
    balanceReadStatus: "failed",
    balanceReadReason:
      "Token decimals were unavailable or did not match the reviewed contract metadata at the selected block.",
    valuationStatus: "failed",
    valuationReason:
      "The token scale could not be verified at the selected block, so Powerrr did not value it.",
  };
}

function portfolioAsset(
  token: EthereumTokenRegistryEntry,
  balanceRaw: bigint,
  blockNumber: string,
  priceUsd?: number,
  priceSource?: string,
  valuationReason?: string,
  price?: OnchainPriceResult,
  convertedProtocolBalanceRaw?: bigint,
): PortfolioAsset {
  const balance = formatUnits(balanceRaw, token.decimals);
  const metadata = ethereumAssetMetadataByAddress(token.address);
  const conversionRate =
    convertedProtocolBalanceRaw !== undefined && balanceRaw > 0n
      ? Number((convertedProtocolBalanceRaw * 1_000_000_000n) / balanceRaw) /
        1_000_000_000
      : undefined;
  return {
    chainId: 1,
    token: getAddress(token.address) as HexAddress,
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    balance,
    balanceRaw: balanceRaw.toString(),
    ...(priceUsd ? { marketPriceUsd: priceUsd } : {}),
    priceStatus: priceUsd ? "available" : "unavailable",
    protocolEligible: protocolEligibility(token.address),
    balanceReadStatus: "success",
    valuationStatus: priceUsd ? "available" : "manual-review",
    ...(valuationReason ? { valuationReason } : {}),
    ...(priceSource ? { priceProvenance: priceSource } : {}),
    ...(price?.confidence ? { priceConfidence: price.confidence } : {}),
    ...(price?.route ? { priceRoute: price.route } : {}),
    ...(price?.observationSeconds
      ? { priceObservationSeconds: price.observationSeconds }
      : {}),
    ...(price?.liquidityUsd ? { priceLiquidityUsd: price.liquidityUsd } : {}),
    observedBlockNumber: blockNumber,
    assetKind: metadata?.assetKind ?? "erc20",
    ...(metadata?.protocolAssetToken
      ? {
          protocolAssetToken: metadata.protocolAssetToken,
          protocolBalanceRaw: (convertedProtocolBalanceRaw ?? 0n).toString(),
          ...(convertedProtocolBalanceRaw !== undefined
            ? {
                conversionSnapshot: {
                  sourceToken: getAddress(token.address) as HexAddress,
                  targetToken: metadata.protocolAssetToken,
                  sourceAmount: {
                    raw: balanceRaw.toString(),
                    decimals: token.decimals,
                  },
                  targetAmount: {
                    raw: convertedProtocolBalanceRaw.toString(),
                    decimals:
                      ethereumAssetMetadataByAddress(
                        metadata.protocolAssetToken,
                      )?.decimals ?? token.decimals,
                  },
                  kind: metadata.conversion?.kind ?? "identity",
                  observedBlockNumber: blockNumber,
                },
              }
            : {}),
        }
      : {}),
    ...(metadata?.requiredAction
      ? { requiredAction: metadata.requiredAction }
      : {}),
    ...(metadata?.conversion && conversionRate !== undefined
      ? {
          conversion: {
            kind: metadata.conversion.kind,
            fromSymbol: metadata.symbol,
            toSymbol:
              ethereumAssetMetadataByAddress(metadata.protocolAssetToken ?? "")
                ?.symbol ?? "wrapped asset",
            rate: String(conversionRate),
          },
        }
      : {}),
  };
}

function failedAsset(
  token: EthereumTokenRegistryEntry,
  blockNumber: string,
): PortfolioAsset {
  return {
    chainId: 1,
    token: getAddress(token.address) as HexAddress,
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    balance: "0",
    balanceRaw: "0",
    priceStatus: "unavailable",
    protocolEligible: protocolEligibility(token.address),
    balanceReadStatus: "failed",
    balanceReadReason: "balanceOf reverted or returned malformed data.",
    valuationStatus: "failed",
    valuationReason: "Balance was not readable, so Powerrr did not value it.",
    observedBlockNumber: blockNumber,
    assetKind: "erc20",
  };
}

function protocolEligibility(token: string): Record<string, boolean> {
  const metadata = ethereumAssetMetadataByAddress(token);
  return Object.fromEntries(
    metadata?.candidateProviders.map((provider) => [provider, true] as const) ??
      [],
  );
}
