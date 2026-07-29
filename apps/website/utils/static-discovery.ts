import {
  AAVE_V3_ORACLE,
  ETHEREUM_NATIVE_TOKEN,
  ETHEREUM_OWN_TOKEN_REGISTRY_SOURCE,
  ETHEREUM_OWN_TOKEN_REGISTRY_VERSION,
  ethereumAssetMetadataByAddress,
  ethereumOwnTokenRegistryV1,
  type EthereumOwnTokenRegistryEntry,
} from "@powerrr/configs";
import { OWN_OPPORTUNITY_POLICY_VERSION } from "@powerrr/own-underwriter";
import type {
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
    total: ethereumOwnTokenRegistryV1.length,
    message: `Reading ${ethereumOwnTokenRegistryV1.length} ERC-20 balances in one Multicall3 request.`,
  });
  const balanceCalls = ethereumOwnTokenRegistryV1.map((token) => ({
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
  const decodedBalances = ethereumOwnTokenRegistryV1.map((token, index) => ({
    token,
    ...decodeBalance(balanceResults[index]),
  }));
  const positive = decodedBalances.filter(
    (item) => item.status === "success" && item.balanceRaw > 0n,
  );
  input.onProgress?.({
    phase: "balances",
    completed: ethereumOwnTokenRegistryV1.length,
    total: ethereumOwnTokenRegistryV1.length,
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
    positive.map((item) => item.token),
    blockNumberHex,
    chunkSizes,
  );
  const assets: PortfolioAsset[] = decodedBalances.flatMap((item) => {
    if (item.status === "failed") {
      return [failedAsset(item.token, blockNumber)];
    }
    if (item.balanceRaw === 0n) return [];
    const price = prices.get(item.token.address.toLowerCase());
    return [
      portfolioAsset(
        item.token,
        item.balanceRaw,
        blockNumber,
        price?.priceUsd,
        price?.source,
        price?.reason,
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
      ...(wethPrice?.priceUsd ? { marketPriceUsd: wethPrice.priceUsd } : {}),
      priceStatus: wethPrice?.priceUsd ? "available" : "unavailable",
      protocolEligible: protocolEligibility(ETHEREUM_NATIVE_TOKEN),
      balanceReadStatus: "success",
      valuationStatus: wethPrice?.priceUsd ? "available" : "manual-review",
      valuationReason:
        wethPrice?.reason ??
        (wethPrice?.priceUsd ? undefined : "WETH oracle price unavailable."),
      priceProvenance: wethPrice?.source,
      ownEligible: true,
      ownAdvanceRate: 0.95,
      ownValuationHaircut: 0.04,
      ownContributionCapUsd: 500_000,
      ownCapacityContributionUsd: wethPrice?.priceUsd
        ? Math.min(
            Number(formatUnits(nativeBalance, 18)) *
              wethPrice.priceUsd *
              0.95 *
              0.96,
            500_000,
          )
        : 0,
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
    assets,
    registrySource: ETHEREUM_OWN_TOKEN_REGISTRY_SOURCE,
    receipt: {
      walletName: input.walletName,
      account,
      chainId: 1,
      blockNumber,
      blockTimestamp: blockTimestamp.toISOString(),
      blockAgeSeconds,
      registryVersion: ETHEREUM_OWN_TOKEN_REGISTRY_VERSION,
      policyVersion: OWN_OPPORTUNITY_POLICY_VERSION,
      multicallAddress: MULTICALL3_ADDRESS,
      callsAttempted: ethereumOwnTokenRegistryV1.length,
      callsSucceeded: succeeded,
      callsFailed: ethereumOwnTokenRegistryV1.length - succeeded,
      chunkSizes,
      priceSources,
      postedToPowerrr: false,
    },
  };
}

async function loadPrices(
  provider: Eip1193Provider,
  tokens: EthereumOwnTokenRegistryEntry[],
  blockTag: Hex,
  chunkSizes: number[],
): Promise<
  Map<string, { priceUsd?: number; source?: string; reason?: string }>
> {
  const result = new Map<
    string,
    { priceUsd?: number; source?: string; reason?: string }
  >();
  const priced = tokens.filter(
    (token) => token.priceRoute.kind === "aave-oracle",
  );
  const weth = ethereumOwnTokenRegistryV1.find(
    (token) => token.symbol === "WETH",
  );
  if (weth && !priced.some((token) => token.symbol === "WETH"))
    priced.push(weth);
  for (const token of tokens) {
    if (token.priceRoute.kind === "unavailable") {
      result.set(token.address.toLowerCase(), {
        reason: token.priceRoute.reason,
      });
    }
  }
  if (!priced.length) return result;

  const oracles = [
    ...new Set(
      priced.flatMap((token) =>
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
    ...priced.map((token) => ({
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
  priced.forEach((token, index) => {
    if (token.priceRoute.kind !== "aave-oracle") return;
    const raw = decodeUint(responses[oracles.length + index], "getAssetPrice");
    const unit = baseUnits.get(token.priceRoute.oracle.toLowerCase());
    if (!raw || !unit || raw <= 0n || unit <= 0n) {
      result.set(token.address.toLowerCase(), {
        reason: `${token.symbol} returned no valid price from its pinned protocol oracle.`,
      });
      return;
    }
    result.set(token.address.toLowerCase(), {
      priceUsd: Number(raw) / Number(unit),
      source: `Onchain oracle ${token.priceRoute.oracle}`,
    });
  });
  return result;
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
  functionName: "balanceOf" | "BASE_CURRENCY_UNIT" | "getAssetPrice",
): bigint | null {
  if (!result?.success || !/^0x[0-9a-fA-F]{64}$/.test(result.returnData)) {
    return null;
  }
  try {
    return decodeFunctionResult({
      abi: functionName === "balanceOf" ? erc20Abi : oracleAbi,
      functionName,
      data: result.returnData,
    }) as bigint;
  } catch {
    return null;
  }
}

function portfolioAsset(
  token: EthereumOwnTokenRegistryEntry,
  balanceRaw: bigint,
  blockNumber: string,
  priceUsd?: number,
  priceSource?: string,
  valuationReason?: string,
): PortfolioAsset {
  const balance = formatUnits(balanceRaw, token.decimals);
  const contribution = priceUsd
    ? Math.min(
        Number(balance) *
          priceUsd *
          token.ownPolicy.advanceRate *
          (1 - token.ownPolicy.valuationHaircut),
        token.ownPolicy.contributionCapUsd,
      )
    : 0;
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
    ownEligible: true,
    ownAdvanceRate: token.ownPolicy.advanceRate,
    ownValuationHaircut: token.ownPolicy.valuationHaircut,
    ownContributionCapUsd: token.ownPolicy.contributionCapUsd,
    ownCapacityContributionUsd: contribution,
    observedBlockNumber: blockNumber,
    assetKind: "erc20",
  };
}

function failedAsset(
  token: EthereumOwnTokenRegistryEntry,
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
    ownEligible: true,
    ownAdvanceRate: token.ownPolicy.advanceRate,
    ownValuationHaircut: token.ownPolicy.valuationHaircut,
    ownContributionCapUsd: token.ownPolicy.contributionCapUsd,
    ownCapacityContributionUsd: 0,
    observedBlockNumber: blockNumber,
    assetKind: "erc20",
  };
}

function protocolEligibility(token: string): Record<string, boolean> {
  const metadata = ethereumAssetMetadataByAddress(token);
  return Object.fromEntries([
    ["own", true],
    ...(metadata?.candidateProviders.map(
      (provider) => [provider, true] as const,
    ) ?? []),
  ]);
}
