import { writeFile } from "node:fs/promises";
import {
  ethereumMorphoUsdcMarketsV1,
  ethereumTokenRegistryV1,
  MORPHO_BLUE,
} from "../packages/configs/src/index.ts";
import {
  AAVE_V3_ETHEREUM,
  SPARKLEND_ETHEREUM,
} from "../packages/protocol-adapters/src/aave-like-live-source.ts";
import { COMPOUND_USDC_COMET_MAINNET } from "../packages/protocol-adapters/src/compound-live-source.ts";
import {
  createPublicClient,
  erc20Abi,
  getAddress,
  http,
  parseAbi,
  zeroAddress,
  type Address,
} from "viem";
import { mainnet } from "viem/chains";

const rpcUrl = process.env.PUBLIC_ETHEREUM_RPC_URL;
const outputPath = process.argv[2];
if (!rpcUrl || !outputPath) {
  throw new Error(
    "Usage: PUBLIC_ETHEREUM_RPC_URL=<url> pnpm exec tsx tooling/audit-provider-assets.ts <output.json>",
  );
}

const client = createPublicClient({
  chain: mainnet,
  transport: http(rpcUrl, { retryCount: 4, retryDelay: 750, timeout: 30_000 }),
  batch: { multicall: { batchSize: 16_384, wait: 25 } },
});
const blockNumber = await client.getBlockNumber();
const block = await client.getBlock({ blockNumber });
const registry = new Set(
  ethereumTokenRegistryV1.map((token) => token.address.toLowerCase()),
);

const dataProviderAbi = parseAbi([
  "function getAllReservesTokens() view returns ((string symbol,address tokenAddress)[])",
  "function getReserveConfigurationData(address asset) view returns (uint256 decimals,uint256 ltv,uint256 liquidationThreshold,uint256 liquidationBonus,uint256 reserveFactor,bool usageAsCollateralEnabled,bool borrowingEnabled,bool stableBorrowRateEnabled,bool isActive,bool isFrozen)",
  "function getPaused(address asset) view returns (bool)",
  "function getDebtCeiling(address asset) view returns (uint256)",
  "function getReserveData(address asset) view returns (uint256 unbacked,uint256 accruedToTreasuryScaled,uint256 totalAToken,uint256 totalStableDebt,uint256 totalVariableDebt,uint256 liquidityRate,uint256 variableBorrowRate,uint256 stableBorrowRate,uint256 averageStableBorrowRate,uint256 liquidityIndex,uint256 variableBorrowIndex,uint40 lastUpdateTimestamp)",
  "function getReserveCaps(address asset) view returns (uint256 borrowCap,uint256 supplyCap)",
]);
const oracleAbi = parseAbi([
  "function getAssetPrice(address asset) view returns (uint256)",
]);
const cometAbi = parseAbi([
  "function numAssets() view returns (uint8)",
  "function getAssetInfo(uint8 i) view returns ((uint8 offset,address asset,address priceFeed,uint64 scale,uint64 borrowCollateralFactor,uint64 liquidateCollateralFactor,uint64 liquidationFactor,uint128 supplyCap))",
]);
const morphoAbi = parseAbi([
  "function market(bytes32 id) view returns (uint128 totalSupplyAssets,uint128 totalSupplyShares,uint128 totalBorrowAssets,uint128 totalBorrowShares,uint128 lastUpdate,uint128 fee)",
  "function idToMarketParams(bytes32 id) view returns (address loanToken,address collateralToken,address oracle,address irm,uint256 lltv)",
]);
const morphoOracleAbi = parseAbi(["function price() view returns (uint256)"]);

async function auditAaveLike(deployment: typeof AAVE_V3_ETHEREUM) {
  const reserves = await client.readContract({
    address: deployment.dataProvider,
    abi: dataProviderAbi,
    functionName: "getAllReservesTokens",
    blockNumber,
  });
  const rows = await Promise.all(
    reserves.map(async (reserve) => {
      const [configuration, paused, debtCeiling, price, reserveData, caps] =
        await Promise.all([
          client.readContract({
            address: deployment.dataProvider,
            abi: dataProviderAbi,
            functionName: "getReserveConfigurationData",
            args: [reserve.tokenAddress],
            blockNumber,
          }),
          client.readContract({
            address: deployment.dataProvider,
            abi: dataProviderAbi,
            functionName: "getPaused",
            args: [reserve.tokenAddress],
            blockNumber,
          }),
          client.readContract({
            address: deployment.dataProvider,
            abi: dataProviderAbi,
            functionName: "getDebtCeiling",
            args: [reserve.tokenAddress],
            blockNumber,
          }),
          client.readContract({
            address: deployment.oracle,
            abi: oracleAbi,
            functionName: "getAssetPrice",
            args: [reserve.tokenAddress],
            blockNumber,
          }),
          client.readContract({
            address: deployment.dataProvider,
            abi: dataProviderAbi,
            functionName: "getReserveData",
            args: [reserve.tokenAddress],
            blockNumber,
          }),
          client.readContract({
            address: deployment.dataProvider,
            abi: dataProviderAbi,
            functionName: "getReserveCaps",
            args: [reserve.tokenAddress],
            blockNumber,
          }),
        ]);
      const address = getAddress(reserve.tokenAddress);
      const hasSupplyCapacity =
        caps[1] === 0n || caps[1] * 10n ** configuration[0] > reserveData[2];
      const protocolCollateral =
        configuration[5] &&
        configuration[8] &&
        !configuration[9] &&
        !paused &&
        configuration[1] > 0n &&
        price > 0n;
      const currentEstimatorPath =
        protocolCollateral && debtCeiling === 0n && hasSupplyCapacity;
      return {
        symbol: reserve.symbol,
        address,
        decimals: Number(configuration[0]),
        ltvBps: configuration[1].toString(),
        liquidationThresholdBps: configuration[2].toString(),
        protocolCollateral,
        currentEstimatorPath,
        hasSupplyCapacity,
        isolationMode: debtCeiling > 0n,
        active: configuration[8],
        frozen: configuration[9],
        paused,
        oraclePriceRaw: price.toString(),
        currentSupplyRaw: reserveData[2].toString(),
        supplyCapTokens: caps[1].toString(),
        remainingSupplyRaw:
          caps[1] === 0n
            ? null
            : hasSupplyCapacity
              ? (caps[1] * 10n ** configuration[0] - reserveData[2]).toString()
              : "0",
        inRegistry: registry.has(address.toLowerCase()),
      };
    }),
  );
  return {
    protocolId: deployment.protocolId,
    listedCount: rows.length,
    protocolCollateralCount: rows.filter((row) => row.protocolCollateral)
      .length,
    currentEstimatorPathCount: rows.filter((row) => row.currentEstimatorPath)
      .length,
    missingProtocolCollateral: rows.filter(
      (row) => row.protocolCollateral && !row.inRegistry,
    ),
    missingCurrentEstimatorPath: rows.filter(
      (row) => row.currentEstimatorPath && !row.inRegistry,
    ),
    rows,
  };
}

async function auditCompound() {
  const count = await client.readContract({
    address: COMPOUND_USDC_COMET_MAINNET,
    abi: cometAbi,
    functionName: "numAssets",
    blockNumber,
  });
  const infos = await Promise.all(
    Array.from({ length: count }, (_, index) =>
      client.readContract({
        address: COMPOUND_USDC_COMET_MAINNET,
        abi: cometAbi,
        functionName: "getAssetInfo",
        args: [index],
        blockNumber,
      }),
    ),
  );
  const rows = await Promise.all(
    infos.map(async (info) => {
      const address = getAddress(info.asset);
      const [symbol, name, decimals] = await Promise.all([
        client.readContract({
          address,
          abi: erc20Abi,
          functionName: "symbol",
          blockNumber,
        }),
        client.readContract({
          address,
          abi: erc20Abi,
          functionName: "name",
          blockNumber,
        }),
        client.readContract({
          address,
          abi: erc20Abi,
          functionName: "decimals",
          blockNumber,
        }),
      ]);
      return {
        symbol,
        name,
        address,
        decimals,
        borrowCollateralFactor: info.borrowCollateralFactor.toString(),
        liquidateCollateralFactor: info.liquidateCollateralFactor.toString(),
        supplyCapRaw: info.supplyCap.toString(),
        inRegistry: registry.has(address.toLowerCase()),
      };
    }),
  );
  return {
    protocolId: "compound-iii",
    listedCount: rows.length,
    currentEstimatorPathCount: rows.filter(
      (row) =>
        BigInt(row.borrowCollateralFactor) > 0n &&
        BigInt(row.supplyCapRaw) > 0n,
    ).length,
    missingCurrentEstimatorPath: rows.filter(
      (row) =>
        BigInt(row.borrowCollateralFactor) > 0n &&
        BigInt(row.supplyCapRaw) > 0n &&
        !row.inRegistry,
    ),
    rows,
  };
}

async function auditMorpho() {
  const usdc = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const response = await fetch("https://blue-api.morpho.org/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: `query {
        markets(first: 1000, where: {
          chainId_in: [1]
          listed: true
          loanAssetAddress_in: ["${usdc}"]
        }) {
          items {
            marketId
            creationBlockNumber
            irmAddress
            lltv
            collateralAsset { address symbol name decimals }
            oracle { address }
          }
        }
      }`,
    }),
  });
  if (!response.ok) {
    throw new Error(`Morpho market enumeration failed (${response.status}).`);
  }
  const payload = (await response.json()) as {
    data?: {
      markets?: {
        items?: Array<{
          marketId: `0x${string}`;
          creationBlockNumber: number;
          irmAddress: Address;
          lltv: string;
          collateralAsset: {
            address: Address;
            symbol: string;
            name: string;
            decimals: number;
          } | null;
          oracle: { address: Address } | null;
        }>;
      };
    };
    errors?: Array<{ message: string }>;
  };
  if (payload.errors?.length || !payload.data?.markets?.items) {
    throw new Error(
      `Morpho market enumeration failed: ${payload.errors?.[0]?.message ?? "missing result"}`,
    );
  }
  const rows = await mapWithConcurrency(
    payload.data.markets.items,
    8,
    async (candidate) => {
      const candidateOracle = candidate.oracle?.address ?? zeroAddress;
      const candidateCollateral =
        candidate.collateralAsset?.address ?? zeroAddress;
      const [params, market, oraclePrice] = await Promise.all([
        client.readContract({
          address: MORPHO_BLUE,
          abi: morphoAbi,
          functionName: "idToMarketParams",
          args: [candidate.marketId],
          blockNumber,
        }),
        client.readContract({
          address: MORPHO_BLUE,
          abi: morphoAbi,
          functionName: "market",
          args: [candidate.marketId],
          blockNumber,
        }),
        candidateOracle === zeroAddress
          ? Promise.resolve(0n)
          : client
              .readContract({
                address: candidateOracle,
                abi: morphoOracleAbi,
                functionName: "price",
                blockNumber,
              })
              .catch(() => 0n),
      ]);
      const availableLiquidityRaw =
        market[0] > market[2] ? market[0] - market[2] : 0n;
      const collateralAddress = getAddress(params[1]);
      const identityVerified =
        params[0].toLowerCase() === usdc.toLowerCase() &&
        params[1].toLowerCase() === candidateCollateral.toLowerCase() &&
        params[2].toLowerCase() === candidateOracle.toLowerCase() &&
        params[3].toLowerCase() === candidate.irmAddress.toLowerCase() &&
        params[4] === BigInt(candidate.lltv);
      return {
        marketId: candidate.marketId,
        createdAtBlock: candidate.creationBlockNumber.toString(),
        symbol: candidate.collateralAsset?.symbol ?? "UNKNOWN",
        name: candidate.collateralAsset?.name ?? "Unknown token",
        address: collateralAddress,
        decimals: candidate.collateralAsset?.decimals ?? 0,
        oracle: getAddress(params[2]),
        irm: getAddress(params[3]),
        lltv: params[4].toString(),
        identityVerified,
        totalSupplyAssetsRaw: market[0].toString(),
        totalBorrowAssetsRaw: market[2].toString(),
        availableLiquidityRaw: availableLiquidityRaw.toString(),
        availableLiquidityUsdc: Number(availableLiquidityRaw) / 1e6,
        oraclePriceRaw: oraclePrice.toString(),
        hasUsableState:
          identityVerified &&
          params[1] !== zeroAddress &&
          params[2] !== zeroAddress &&
          params[3] !== zeroAddress &&
          params[4] > 0n &&
          oraclePrice > 0n &&
          availableLiquidityRaw > 0n,
        inRegistry: registry.has(collateralAddress.toLowerCase()),
        reviewed: ethereumMorphoUsdcMarketsV1.some(
          (market) =>
            market.marketId.toLowerCase() === candidate.marketId.toLowerCase(),
        ),
      };
    },
  );
  return {
    protocolId: "morpho-blue",
    note: "Morpho Blue market creation is permissionless. The official listed-market index is used only for enumeration; every identity, market state, and oracle price below is verified onchain at the audit block.",
    enumerationSource: "https://blue-api.morpho.org/graphql",
    usdcMarketCount: rows.length,
    usableStateCount: rows.filter((row) => row.hasUsableState).length,
    reviewedCurrentPathCount: ethereumMorphoUsdcMarketsV1.length,
    missingCurrentEstimatorPath: ethereumMorphoUsdcMarketsV1.filter(
      (market) => !registry.has(market.collateralToken.toLowerCase()),
    ),
    unreviewedUsableMarkets: rows
      .filter((row) => row.hasUsableState && !row.reviewed)
      .sort(
        (left, right) =>
          right.availableLiquidityUsdc - left.availableLiquidityUsdc,
      ),
    rows,
  };
}

async function mapWithConcurrency<TInput, TOutput>(
  inputs: readonly TInput[],
  concurrency: number,
  work: (input: TInput) => Promise<TOutput>,
): Promise<TOutput[]> {
  const output = new Array<TOutput>(inputs.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, inputs.length) }, async () => {
      while (cursor < inputs.length) {
        const index = cursor;
        cursor += 1;
        output[index] = await work(inputs[index]!);
      }
    }),
  );
  return output;
}

const [aave, spark, compound, morpho] = await Promise.all([
  auditAaveLike(AAVE_V3_ETHEREUM),
  auditAaveLike(SPARKLEND_ETHEREUM),
  auditCompound(),
  auditMorpho(),
]);
const report = {
  generatedAt: new Date().toISOString(),
  rpcHost: new URL(rpcUrl).host,
  block: {
    number: blockNumber.toString(),
    hash: block.hash,
    timestamp: new Date(Number(block.timestamp) * 1_000).toISOString(),
  },
  registryCount: ethereumTokenRegistryV1.length,
  providers: { aave, spark, compound, morpho },
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify(
    {
      outputPath,
      block: report.block,
      registryCount: report.registryCount,
      summary: Object.fromEntries(
        Object.entries(report.providers).map(([id, provider]) => [
          id,
          {
            currentEstimatorPathCount:
              "currentEstimatorPathCount" in provider
                ? provider.currentEstimatorPathCount
                : provider.reviewedCurrentPathCount,
            missingCurrentEstimatorPath: provider.missingCurrentEstimatorPath,
          },
        ]),
      ),
    },
    null,
    2,
  ),
);
