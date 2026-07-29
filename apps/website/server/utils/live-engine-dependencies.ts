import {
  ETHEREUM_ASSET_REGISTRY_VERSION,
  ethereumAssetRegistryV1,
  type EthereumAssetRegistryEntry,
} from "@powerrr/configs";
import {
  createLiveSnapshotEngineDependencies,
  PowerrrEngineError,
  type PowerrrEngineDependencies,
} from "@powerrr/engine-sdk";
import {
  isEthereumAddress,
  normalizeAddress,
  summarizePortfolio,
} from "@powerrr/portfolio";
import {
  AAVE_V3_ETHEREUM,
  SPARKLEND_ETHEREUM,
  getProtocolMetadata,
  loadAaveLikeSnapshot,
  loadCompoundUsdcCometSnapshot,
  loadMorphoSnapshot,
  type CompoundLiveRpcClient,
  type LiveQuoteSnapshot,
} from "@powerrr/protocol-adapters";
import type { LiveSourceClients } from "@powerrr/clients";
import type {
  PortfolioAsset,
  PortfolioResponse,
  ProtocolAvailability,
  ProtocolAdapterInput,
  ResolveRequest,
  ResolveResponse,
} from "@powerrr/shared-types";
import {
  createPublicClient,
  custom,
  decodeFunctionResult,
  encodeFunctionData,
  formatUnits,
  getAddress,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import { recordSourceRead } from "./source-health.js";

const erc20Abi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
]);
const oracleAbi = parseAbi([
  "function BASE_CURRENCY_UNIT() view returns (uint256)",
  "function getAssetPrice(address asset) view returns (uint256)",
]);
const wstEthAbi = parseAbi([
  "function getWstETHByStETH(uint256 stETHAmount) view returns (uint256)",
]);

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const SUPPORTED_LIVE_PROTOCOLS = new Set([
  "aave-v3",
  "morpho-blue",
  "compound-iii",
  "sparklend",
]);
const ZERO_BIGINT = BigInt(0);
const PROVIDER_DEADLINE_MS = 3_500;
const FRESHNESS_LIMIT_SECONDS = 60;

type BatchRpcClient = CompoundLiveRpcClient & {
  batch?<TResult>(
    requests: Array<{ method: string; params?: unknown[] }>,
  ): Promise<TResult[]>;
};

export function createNuxtLiveEngineDependencies(
  liveSources: LiveSourceClients,
): Partial<PowerrrEngineDependencies> {
  const rpc = liveSources.clients.ethereumRpc;
  if (!rpc) {
    throw new PowerrrEngineError(
      "PROTOCOL_SOURCE_UNAVAILABLE",
      "POWERRR_DATA_MODE=live requires ETHEREUM_RPC_URL for Nuxt live dependencies",
      503,
      {
        missingRequiredEnvKeys: ["ETHEREUM_RPC_URL"],
      },
    );
  }

  return createLiveSnapshotEngineDependencies({
    resolveAddress: (request) => resolveLiveAddress(request, rpc),
    getPortfolio: (request, resolved) =>
      getLivePortfolio(request, rpc, resolved),
    getProtocolMetadata: () =>
      getProtocolMetadata()
        .filter((protocol) => SUPPORTED_LIVE_PROTOCOLS.has(protocol.id))
        .map((protocol) => ({ ...protocol, status: "live-ready" as const })),
    loadSnapshots: (input) => loadNuxtLiveSnapshots(input, liveSources),
  });
}

export async function resolveLiveAddress(
  request: ResolveRequest,
  rpc: CompoundLiveRpcClient,
): Promise<ResolveResponse> {
  if (request.chainId !== 1) {
    throw new PowerrrEngineError(
      "UNSUPPORTED_CHAIN",
      "Only Ethereum mainnet is supported in this build",
      422,
    );
  }

  if (request.input.address) {
    const block = await currentBlockContext(rpc);
    return {
      chainId: request.chainId,
      input: request.input.address,
      resolvedAddress: normalizeAddress(request.input.address),
      blockNumber: block.number,
      blockTimestamp: block.timestamp,
    };
  }

  const rawEnsName = request.input.ensName;
  if (!rawEnsName) {
    throw new PowerrrEngineError(
      "ENS_RESOLUTION_FAILED",
      "ENS name is required",
      400,
    );
  }
  try {
    const ensName = normalizeLiveEnsName(rawEnsName);
    const block = await currentBlockContext(rpc);
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: custom({
        request: async ({ method, params }) =>
          rpc.request({
            method,
            ...(params ? { params: [...params] } : {}),
          }),
      }),
    });
    const address = await publicClient.getEnsAddress({
      name: ensName,
      blockNumber: BigInt(block.number),
      gatewayUrls: ["https://ccip-v3.ens.xyz"],
      strict: true,
    });
    if (!address || address.toLowerCase() === ZERO_ADDRESS) {
      throw new Error(
        "name is unregistered or has no nonzero Ethereum address record",
      );
    }
    return {
      chainId: request.chainId,
      input: ensName,
      resolvedAddress: getAddress(address),
      resolvedEnsName: ensName,
      blockNumber: block.number,
      blockTimestamp: block.timestamp,
    };
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "ens-resolution.failed",
        errorCategory: error instanceof Error ? error.name : "unknown",
      }),
    );
    throw new PowerrrEngineError(
      "ENS_RESOLUTION_FAILED",
      "We could not resolve that ENS name. Check the spelling or use a 0x address.",
      404,
    );
  }
}

export async function getLivePortfolio(
  request: ResolveRequest,
  rpc: BatchRpcClient,
  resolvedInput?: ResolveResponse,
): Promise<PortfolioResponse> {
  const resolved = resolvedInput ?? (await resolveLiveAddress(request, rpc));
  const blockTag = resolved.blockNumber
    ? toBlockTag(resolved.blockNumber)
    : "latest";
  const balanceResults = await rpcBatch<Hex>(
    rpc,
    ethereumAssetRegistryV1.map((asset) =>
      balanceRequest(asset, resolved.resolvedAddress as Address, blockTag),
    ),
  );
  const balanceRows = ethereumAssetRegistryV1.map((asset, index) => ({
    asset,
    balanceRaw: decodeBalanceResult(asset, balanceResults[index]),
  }));
  const unreadableBalanceSymbols = balanceRows.flatMap(
    ({ asset, balanceRaw }) => (balanceRaw === null ? [asset.symbol] : []),
  );
  const positive = balanceRows.flatMap(({ asset, balanceRaw }) =>
    balanceRaw !== null && balanceRaw > ZERO_BIGINT
      ? [{ asset, balanceRaw }]
      : [],
  );
  const oracleAddresses = [
    ...new Set(
      positive.map(({ asset }) => asset.priceSource.oracle.toLowerCase()),
    ),
  ];
  const baseUnitRequests = oracleAddresses.map((oracle) =>
    contractRequest(
      oracle as Address,
      oracleAbi,
      "BASE_CURRENCY_UNIT",
      [],
      blockTag,
    ),
  );
  const priceRequests = positive.map(({ asset }) =>
    contractRequest(
      asset.priceSource.oracle.toLowerCase() as Address,
      oracleAbi,
      "getAssetPrice",
      [asset.priceSource.asset.toLowerCase()],
      blockTag,
    ),
  );
  const conversionRows = positive.filter(
    ({ asset }) => asset.conversion?.kind === "wsteth",
  );
  const conversionRequests = conversionRows.map(({ asset, balanceRaw }) =>
    contractRequest(
      asset.conversion?.contract as Address,
      wstEthAbi,
      "getWstETHByStETH",
      [balanceRaw],
      blockTag,
    ),
  );
  const enrichmentResults = await rpcBatch<Hex>(rpc, [
    ...baseUnitRequests,
    ...priceRequests,
    ...conversionRequests,
  ]);
  const baseUnits = new Map(
    oracleAddresses.map((oracle, index) => [
      oracle,
      decodeUintResultOrNull(
        oracleAbi,
        "BASE_CURRENCY_UNIT",
        enrichmentResults[index],
      ),
    ]),
  );
  const conversionRawBySymbol = new Map(
    conversionRows.map(({ asset }, index) => [
      asset.symbol,
      decodeUintResultOrNull(
        wstEthAbi,
        "getWstETHByStETH",
        enrichmentResults[
          baseUnitRequests.length + priceRequests.length + index
        ],
      ),
    ]),
  );
  const assets: PortfolioAsset[] = positive.map(
    ({ asset, balanceRaw }, index) => {
      const priceRaw = decodeUintResultOrNull(
        oracleAbi,
        "getAssetPrice",
        enrichmentResults[baseUnitRequests.length + index],
      );
      const baseUnit =
        baseUnits.get(asset.priceSource.oracle.toLowerCase()) ?? null;
      const protocolBalanceRaw =
        asset.conversion?.kind === "wsteth"
          ? (conversionRawBySymbol.get(asset.symbol) ?? undefined)
          : asset.protocolAssetToken
            ? balanceRaw
            : undefined;
      const conversionRate =
        protocolBalanceRaw === undefined
          ? null
          : Number(formatUnits(protocolBalanceRaw, asset.decimals)) /
            Number(formatUnits(balanceRaw, asset.decimals));
      const sourcePriceUsd =
        priceRaw !== null &&
        baseUnit !== null &&
        priceRaw > ZERO_BIGINT &&
        baseUnit > ZERO_BIGINT
          ? Number(priceRaw) / Number(baseUnit)
          : null;
      const marketPriceUsd =
        sourcePriceUsd === null
          ? null
          : asset.conversion?.kind === "wsteth" && conversionRate !== null
            ? sourcePriceUsd * conversionRate
            : sourcePriceUsd;

      return {
        chainId: resolved.chainId,
        token: getAddress(asset.address.toLowerCase()),
        symbol: asset.symbol,
        name: asset.name,
        decimals: asset.decimals,
        balance: formatUnits(balanceRaw, asset.decimals),
        balanceRaw: balanceRaw.toString(),
        ...(marketPriceUsd !== null ? { marketPriceUsd } : {}),
        priceStatus: marketPriceUsd === null ? "unavailable" : "available",
        protocolEligible: {},
        assetKind: asset.assetKind,
        ...(asset.protocolAssetToken
          ? {
              protocolAssetToken: getAddress(
                asset.protocolAssetToken.toLowerCase(),
              ),
            }
          : {}),
        ...(protocolBalanceRaw !== undefined
          ? { protocolBalanceRaw: protocolBalanceRaw.toString() }
          : {}),
        ...(asset.requiredAction
          ? { requiredAction: asset.requiredAction }
          : {}),
        ...(asset.conversion && conversionRate !== null
          ? {
              conversion: {
                kind: asset.conversion.kind,
                fromSymbol: asset.symbol,
                toSymbol:
                  asset.protocolAssetToken ===
                  ethereumAssetRegistryV1[1]?.address
                    ? "WETH"
                    : "wstETH",
                rate: String(conversionRate),
              },
            }
          : {}),
      };
    },
  );
  const fetchedAt = new Date();
  const blockTimestamp = resolved.blockTimestamp;
  const freshnessSeconds = blockTimestamp
    ? Math.max(
        0,
        Math.floor(
          (fetchedAt.getTime() - new Date(blockTimestamp).getTime()) / 1_000,
        ),
      )
    : undefined;
  const portfolioPartial =
    unreadableBalanceSymbols.length > 0 ||
    assets.some((asset) => asset.priceStatus === "unavailable");

  return {
    resolvedAddress: resolved.resolvedAddress,
    ...(resolved.resolvedEnsName
      ? { resolvedEnsName: resolved.resolvedEnsName }
      : {}),
    chainId: resolved.chainId,
    assets,
    summary: summarizePortfolio(assets),
    completeness: portfolioPartial ? "partial" : "complete",
    provenance: [
      {
        source: `Ethereum mainnet RPC batch reads using ${ETHEREUM_ASSET_REGISTRY_VERSION}`,
        sourceType: "on-chain",
        fetchedAt: fetchedAt.toISOString(),
        ...(blockTimestamp
          ? { observedAt: blockTimestamp, blockTimestamp }
          : {}),
        ...(freshnessSeconds === undefined ? {} : { freshnessSeconds }),
        freshnessStatus:
          freshnessSeconds === undefined
            ? "unknown"
            : freshnessSeconds > FRESHNESS_LIMIT_SECONDS
              ? "stale"
              : "fresh",
        ...(resolved.blockNumber ? { blockNumber: resolved.blockNumber } : {}),
      },
    ],
    warnings: [
      ...(unreadableBalanceSymbols.length
        ? [
            `Some supported token balances were unavailable and excluded (${unreadableBalanceSymbols.join(", ")}).`,
          ]
        : []),
      ...(assets.some((asset) => asset.priceStatus === "unavailable")
        ? [
            "Some positive supported balances could not be priced and were excluded from borrowing capacity.",
          ]
        : []),
      "Only the reviewed blue-chip registry is queried; unsupported wallet tokens are intentionally omitted.",
      "This non-production preview has no availability guarantee.",
      "Protocol quote values use protocol-native source reads where live adapters are wired.",
    ],
  };
}

function decodeBalanceResult(
  asset: EthereumAssetRegistryEntry,
  data: Hex | undefined,
): bigint | null {
  if (!data || data === "0x") return null;
  if (asset.assetKind === "native") {
    try {
      return BigInt(data);
    } catch {
      return null;
    }
  }
  return decodeUintResultOrNull(erc20Abi, "balanceOf", data);
}

async function loadNuxtLiveSnapshots(
  input: ProtocolAdapterInput & { includeProtocols?: string[] },
  liveSources: LiveSourceClients,
) {
  const rpc = liveSources.clients.ethereumRpc;
  if (!rpc) {
    throw new PowerrrEngineError(
      "PROTOCOL_SOURCE_UNAVAILABLE",
      "Ethereum RPC is unavailable",
      503,
    );
  }
  const requested = input.includeProtocols?.length
    ? expandProtocolFamilies(input.includeProtocols)
    : [...SUPPORTED_LIVE_PROTOCOLS];
  const tasks = requested.map((protocolId) => ({
    protocolId,
    load: snapshotLoader(protocolId, input, liveSources),
  }));
  const settled = await Promise.all(
    tasks.map(async ({ protocolId, load }) => {
      const startedAt = Date.now();
      if (!load) {
        const result = {
          protocolId,
          status: "rejected" as const,
          code: SUPPORTED_LIVE_PROTOCOLS.has(protocolId)
            ? ("NOT_CONFIGURED" as const)
            : ("UNSUPPORTED" as const),
          reason: SUPPORTED_LIVE_PROTOCOLS.has(protocolId)
            ? "Live estimate is not configured for this provider"
            : "This provider is not supported",
        };
        logProviderRead(result, input, Date.now() - startedAt);
        return result;
      }
      try {
        const result = {
          protocolId,
          status: "fulfilled" as const,
          snapshot: await withDeadline(load(), PROVIDER_DEADLINE_MS),
        };
        logProviderRead(result, input, Date.now() - startedAt);
        return result;
      } catch (error) {
        const result = {
          protocolId,
          status: "rejected" as const,
          code:
            error instanceof ProviderDeadlineError
              ? ("DEADLINE_EXCEEDED" as const)
              : ("SOURCE_READ_FAILED" as const),
          reason:
            error instanceof ProviderDeadlineError
              ? "Live estimate timed out"
              : "Live estimate temporarily unavailable",
        };
        logProviderRead(result, input, Date.now() - startedAt);
        return result;
      }
    }),
  );

  return {
    snapshots: settled.flatMap((result) =>
      result.status === "fulfilled" ? [result.snapshot] : [],
    ),
    protocolAvailability: settled.map<ProtocolAvailability>((result) =>
      result.status === "fulfilled"
        ? { protocolId: result.protocolId, status: "available" }
        : {
            protocolId: result.protocolId,
            status: "unavailable",
            code: result.code,
            reason: result.reason,
          },
    ),
  };
}

function logProviderRead(
  result: {
    protocolId: string;
    status: "fulfilled" | "rejected";
    code?: string;
  },
  input: ProtocolAdapterInput,
  durationMs: number,
): void {
  recordSourceRead({
    sourceId: result.protocolId,
    success: result.status === "fulfilled",
    durationMs,
    ...(result.code ? { code: result.code } : {}),
  });
  console.info(
    JSON.stringify({
      event: "provider-source.completed",
      protocolId: result.protocolId,
      status: result.status,
      ...(result.code ? { code: result.code } : {}),
      durationMs,
      blockNumber: input.asOfBlock ?? "unknown",
    }),
  );
}

function expandProtocolFamilies(requested: string[]): string[] {
  return [
    ...new Set(
      requested.flatMap((protocolId) =>
        protocolId === "aave" ? ["aave-v3"] : [protocolId],
      ),
    ),
  ];
}

async function currentBlockContext(
  rpc: CompoundLiveRpcClient,
): Promise<{ number: string; timestamp: string }> {
  const blockNumber = await rpc.request<Hex>({ method: "eth_blockNumber" });
  const block = await rpc.request<{ timestamp?: Hex }>({
    method: "eth_getBlockByNumber",
    params: [blockNumber, false],
  });
  if (!block.timestamp) {
    throw new PowerrrEngineError(
      "PROTOCOL_SOURCE_UNAVAILABLE",
      "Ethereum RPC did not return the pinned block timestamp",
      503,
    );
  }

  return {
    number: String(BigInt(blockNumber)),
    timestamp: new Date(Number(BigInt(block.timestamp)) * 1_000).toISOString(),
  };
}

function balanceRequest(
  asset: EthereumAssetRegistryEntry,
  account: Address,
  blockTag: string,
) {
  if (asset.assetKind === "native") {
    return { method: "eth_getBalance", params: [account, blockTag] };
  }
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account],
  });
  return {
    method: "eth_call",
    params: [
      {
        to: asset.address,
        data,
      },
      blockTag,
    ],
  };
}

function contractRequest(
  to: Address,
  abi: ReturnType<typeof parseAbi>,
  functionName: string,
  args: unknown[],
  blockTag: string,
) {
  const data = encodeFunctionData({ abi, functionName, args } as never);
  return {
    method: "eth_call",
    params: [{ to, data }, blockTag],
  };
}

async function rpcBatch<TResult>(
  rpc: BatchRpcClient,
  requests: Array<{ method: string; params?: unknown[] }>,
): Promise<TResult[]> {
  if (rpc.batch) {
    return rpc.batch<TResult>(requests);
  }
  return Promise.all(requests.map((request) => rpc.request<TResult>(request)));
}

function toBlockTag(blockNumber: string): Hex {
  return `0x${BigInt(blockNumber).toString(16)}`;
}

function decodeUintResult(
  abi: ReturnType<typeof parseAbi>,
  functionName: string,
  data: Hex | undefined,
): bigint {
  if (!data || data === "0x") {
    throw new Error(`${functionName} returned no decodable value`);
  }
  return decodeFunctionResult({ abi, functionName, data } as never) as bigint;
}

function decodeUintResultOrNull(
  abi: ReturnType<typeof parseAbi>,
  functionName: string,
  data: Hex | undefined,
): bigint | null {
  try {
    return decodeUintResult(abi, functionName, data);
  } catch {
    return null;
  }
}

function snapshotLoader(
  protocolId: string,
  input: ProtocolAdapterInput,
  liveSources: LiveSourceClients,
): (() => Promise<LiveQuoteSnapshot>) | null {
  const rpc = liveSources.clients.ethereumRpc;
  if (!rpc) return null;
  if (protocolId === "aave-v3") {
    return () =>
      loadAaveLikeSnapshot({ ...input, rpc, deployment: AAVE_V3_ETHEREUM });
  }
  if (protocolId === "compound-iii") {
    return () => loadCompoundUsdcCometSnapshot({ ...input, rpc });
  }
  if (protocolId === "sparklend") {
    return () =>
      loadAaveLikeSnapshot({ ...input, rpc, deployment: SPARKLEND_ETHEREUM });
  }
  if (protocolId === "morpho-blue" && liveSources.clients.morphoGraphQl) {
    return () =>
      loadMorphoSnapshot({
        ...input,
        graphQl: liveSources.clients.morphoGraphQl as NonNullable<
          typeof liveSources.clients.morphoGraphQl
        >,
      });
  }
  return null;
}

async function withDeadline<T>(
  promise: Promise<T>,
  deadlineMs: number,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new ProviderDeadlineError()),
          deadlineMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

class ProviderDeadlineError extends Error {
  constructor() {
    super("provider deadline exceeded");
    this.name = "ProviderDeadlineError";
  }
}

export function isLiveAddressInput(request: ResolveRequest): boolean {
  return Boolean(
    request.input.address && isEthereumAddress(request.input.address),
  );
}

export function normalizeLiveEnsName(value: string): string {
  return normalize(value.trim());
}
