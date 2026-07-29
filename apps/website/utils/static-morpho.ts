import {
  ETHEREUM_MORPHO_USDC_MARKET_MANIFEST_VERSION,
  MORPHO_BLUE,
  ethereumMorphoUsdcMarketsV1,
  type EthereumMorphoUsdcMarket,
} from "@powerrr/configs";
import type { MorphoLiveSnapshot } from "@powerrr/protocol-adapters";
import type { PortfolioAsset, ReadReceipt } from "@powerrr/shared-types";
import {
  decodeFunctionResult,
  encodeFunctionData,
  formatUnits,
  isAddressEqual,
  toHex,
  type Address,
  type Hex,
} from "viem";
import type { Eip1193Provider } from "./static-discovery";

const ORACLE_PRICE_SCALE = 10n ** 36n;
const WAD = 10n ** 18n;
const SECONDS_PER_YEAR = 31_536_000;

const morphoAbi = [
  {
    type: "function",
    name: "idToMarketParams",
    stateMutability: "view",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [
      { name: "loanToken", type: "address" },
      { name: "collateralToken", type: "address" },
      { name: "oracle", type: "address" },
      { name: "irm", type: "address" },
      { name: "lltv", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "market",
    stateMutability: "view",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [
      { name: "totalSupplyAssets", type: "uint128" },
      { name: "totalSupplyShares", type: "uint128" },
      { name: "totalBorrowAssets", type: "uint128" },
      { name: "totalBorrowShares", type: "uint128" },
      { name: "lastUpdate", type: "uint128" },
      { name: "fee", type: "uint128" },
    ],
  },
] as const;

const oracleAbi = [
  {
    type: "function",
    name: "price",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "price", type: "uint256" }],
  },
] as const;

const irmAbi = [
  {
    type: "function",
    name: "borrowRateView",
    stateMutability: "view",
    inputs: [
      {
        name: "marketParams",
        type: "tuple",
        components: [
          { name: "loanToken", type: "address" },
          { name: "collateralToken", type: "address" },
          { name: "oracle", type: "address" },
          { name: "irm", type: "address" },
          { name: "lltv", type: "uint256" },
        ],
      },
      {
        name: "market",
        type: "tuple",
        components: [
          { name: "totalSupplyAssets", type: "uint128" },
          { name: "totalSupplyShares", type: "uint128" },
          { name: "totalBorrowAssets", type: "uint128" },
          { name: "totalBorrowShares", type: "uint128" },
          { name: "lastUpdate", type: "uint128" },
          { name: "fee", type: "uint128" },
        ],
      },
    ],
    outputs: [{ name: "rate", type: "uint256" }],
  },
] as const;

type MarketState = {
  totalSupplyAssets: bigint;
  totalSupplyShares: bigint;
  totalBorrowAssets: bigint;
  totalBorrowShares: bigint;
  lastUpdate: bigint;
  fee: bigint;
};

export async function loadStaticMorphoSnapshot(input: {
  provider: Eip1193Provider;
  portfolio: PortfolioAsset[];
  receipt: ReadReceipt;
}): Promise<MorphoLiveSnapshot & { kind: "morpho" }> {
  const blockTag = toHex(BigInt(input.receipt.blockNumber));
  const markets = [];

  for (const manifest of ethereumMorphoUsdcMarketsV1) {
    const walletAssets = input.portfolio.filter(
      (asset) =>
        positiveRawBalance(asset) &&
        isAddressEqual(
          (asset.protocolAssetToken ?? asset.token) as Address,
          manifest.collateralToken,
        ),
    );
    if (!walletAssets.length) continue;

    const params = await readMarketParams(input.provider, manifest, blockTag);
    const state = await readMarketState(
      input.provider,
      manifest.marketId,
      blockTag,
    );
    const accruedState = await accrueMarketState(
      input.provider,
      params,
      state,
      input.receipt.blockTimestamp,
      blockTag,
    );
    const oraclePrice = await readOraclePrice(
      input.provider,
      manifest.oracle,
      blockTag,
    );
    const collateralRaw = walletAssets.reduce(
      (sum, asset) =>
        sum + BigInt(asset.protocolBalanceRaw ?? asset.balanceRaw),
      0n,
    );
    const collateralValueLoanRaw =
      (collateralRaw * oraclePrice) / ORACLE_PRICE_SCALE;
    const valueUsd = Number(
      formatUnits(collateralValueLoanRaw, manifest.loanDecimals),
    );
    const liquidityRaw =
      accruedState.totalSupplyAssets > accruedState.totalBorrowAssets
        ? accruedState.totalSupplyAssets - accruedState.totalBorrowAssets
        : 0n;
    const borrowApy = await readBorrowApy(
      input.provider,
      params,
      accruedState,
      blockTag,
    );

    if (!Number.isFinite(valueUsd) || valueUsd <= 0 || liquidityRaw <= 0n) {
      continue;
    }
    markets.push({
      token: walletAssets[0]!.token,
      symbol: [...new Set(walletAssets.map((asset) => asset.symbol))].join(
        " + ",
      ),
      valueUsd,
      lltv: Number(manifest.lltv) / Number(WAD),
      marketId: manifest.marketId,
      availableLiquidityUsd: Number(
        formatUnits(liquidityRaw, manifest.loanDecimals),
      ),
      borrowApy,
      priceObservedAt: input.receipt.blockTimestamp,
      freshnessSeconds: input.receipt.blockAgeSeconds,
    });
  }

  if (!markets.length) {
    throw new Error(
      "No checked-in USDC market matched the selected collateral with readable onchain state.",
    );
  }

  return {
    kind: "morpho",
    protocolId: "morpho-blue",
    protocolLabel: "Morpho Blue",
    familyId: "morpho-blue",
    familyLabel: "Morpho Blue",
    chainId: 1,
    mode: "wallet-estimate",
    targetBorrowAsset: "USDC",
    rateType: "variable",
    indicativeApr: null,
    annualRateValue: null,
    annualRateConvention: "apy",
    rateSourceId: "morpho-blue:adaptive-curve-irm",
    existingDebtUsd: 0,
    availableLiquidityUsd: Math.max(
      ...markets.map((market) => market.availableLiquidityUsd ?? 0),
    ),
    source: "Morpho Blue market, oracle, and IRM onchain reads",
    sourceType: "on-chain",
    freshnessSeconds: input.receipt.blockAgeSeconds,
    fetchedAt: new Date().toISOString(),
    observedAt: input.receipt.blockTimestamp,
    blockNumber: input.receipt.blockNumber,
    blockTimestamp: input.receipt.blockTimestamp,
    assumptions: [
      `Market IDs are pinned in ${ETHEREUM_MORPHO_USDC_MARKET_MANIFEST_VERSION}.`,
      "Native ETH is represented as WETH for market comparison and must be wrapped before deposit.",
      "USDC-denominated capacity is displayed as USD for comparison.",
      "Stored Morpho market state is interest-accrued to the pinned block timestamp before rate and liquidity calculations.",
    ],
    warnings: [],
    confidencePenalties: {
      sourcePenalty: 0,
      stalenessPenalty: input.receipt.blockAgeSeconds > 60 ? 5 : 0,
      fallbackPenalty: 0,
      complexityPenalty: 4,
      liquidityPenalty: 0,
    },
    safetyProfile: "balanced",
    markets,
  };
}

function positiveRawBalance(asset: PortfolioAsset): boolean {
  try {
    return BigInt(asset.protocolBalanceRaw ?? asset.balanceRaw) > 0n;
  } catch {
    return false;
  }
}

async function readMarketParams(
  provider: Eip1193Provider,
  manifest: EthereumMorphoUsdcMarket,
  blockTag: Hex,
) {
  const response = await ethCall(
    provider,
    MORPHO_BLUE,
    encodeFunctionData({
      abi: morphoAbi,
      functionName: "idToMarketParams",
      args: [manifest.marketId],
    }),
    blockTag,
  );
  const decoded = decodeFunctionResult({
    abi: morphoAbi,
    functionName: "idToMarketParams",
    data: response,
  });
  const [loanToken, collateralToken, oracle, irm, lltv] = decoded;
  if (
    !isAddressEqual(loanToken, manifest.loanToken) ||
    !isAddressEqual(collateralToken, manifest.collateralToken) ||
    !isAddressEqual(oracle, manifest.oracle) ||
    !isAddressEqual(irm, manifest.irm) ||
    lltv !== manifest.lltv
  ) {
    throw new Error(
      "A checked-in market ID did not match its onchain parameters.",
    );
  }
  return { loanToken, collateralToken, oracle, irm, lltv };
}

async function readMarketState(
  provider: Eip1193Provider,
  marketId: Hex,
  blockTag: Hex,
): Promise<MarketState> {
  const response = await ethCall(
    provider,
    MORPHO_BLUE,
    encodeFunctionData({
      abi: morphoAbi,
      functionName: "market",
      args: [marketId],
    }),
    blockTag,
  );
  const [
    totalSupplyAssets,
    totalSupplyShares,
    totalBorrowAssets,
    totalBorrowShares,
    lastUpdate,
    fee,
  ] = decodeFunctionResult({
    abi: morphoAbi,
    functionName: "market",
    data: response,
  });
  return {
    totalSupplyAssets,
    totalSupplyShares,
    totalBorrowAssets,
    totalBorrowShares,
    lastUpdate,
    fee,
  };
}

async function readOraclePrice(
  provider: Eip1193Provider,
  oracle: Address,
  blockTag: Hex,
): Promise<bigint> {
  const response = await ethCall(
    provider,
    oracle,
    encodeFunctionData({ abi: oracleAbi, functionName: "price" }),
    blockTag,
  );
  const price = decodeFunctionResult({
    abi: oracleAbi,
    functionName: "price",
    data: response,
  });
  if (price <= 0n)
    throw new Error("The checked-in market oracle returned no price.");
  return price;
}

async function readBorrowApy(
  provider: Eip1193Provider,
  params: {
    loanToken: Address;
    collateralToken: Address;
    oracle: Address;
    irm: Address;
    lltv: bigint;
  },
  market: MarketState,
  blockTag: Hex,
): Promise<number | null> {
  try {
    const response = await ethCall(
      provider,
      params.irm,
      encodeFunctionData({
        abi: irmAbi,
        functionName: "borrowRateView",
        args: [params, market],
      }),
      blockTag,
    );
    const ratePerSecond = decodeFunctionResult({
      abi: irmAbi,
      functionName: "borrowRateView",
      data: response,
    });
    const annualRate = (Number(ratePerSecond) / Number(WAD)) * SECONDS_PER_YEAR;
    if (!Number.isFinite(annualRate) || annualRate < 0 || annualRate > 20) {
      return null;
    }
    return Math.expm1(annualRate);
  } catch {
    return null;
  }
}

async function accrueMarketState(
  provider: Eip1193Provider,
  params: {
    loanToken: Address;
    collateralToken: Address;
    oracle: Address;
    irm: Address;
    lltv: bigint;
  },
  market: MarketState,
  blockTimestamp: string,
  blockTag: Hex,
): Promise<MarketState> {
  const timestampMs = new Date(blockTimestamp).getTime();
  if (!Number.isFinite(timestampMs)) return market;
  const timestamp = BigInt(Math.floor(timestampMs / 1_000));
  if (timestamp <= market.lastUpdate) return market;
  if (market.totalBorrowAssets <= 0n)
    return { ...market, lastUpdate: timestamp };

  try {
    const response = await ethCall(
      provider,
      params.irm,
      encodeFunctionData({
        abi: irmAbi,
        functionName: "borrowRateView",
        args: [params, market],
      }),
      blockTag,
    );
    const ratePerSecond = decodeFunctionResult({
      abi: irmAbi,
      functionName: "borrowRateView",
      data: response,
    });
    const elapsed = timestamp - market.lastUpdate;
    const compoundedRate = wTaylorCompounded(ratePerSecond, elapsed);
    const interest = (market.totalBorrowAssets * compoundedRate) / WAD;

    return {
      ...market,
      totalSupplyAssets: market.totalSupplyAssets + interest,
      totalBorrowAssets: market.totalBorrowAssets + interest,
      lastUpdate: timestamp,
    };
  } catch {
    return market;
  }
}

function wTaylorCompounded(
  ratePerSecond: bigint,
  elapsedSeconds: bigint,
): bigint {
  const firstTerm = ratePerSecond * elapsedSeconds;
  const secondTerm = (firstTerm * firstTerm) / (2n * WAD);
  const thirdTerm = (secondTerm * firstTerm) / (3n * WAD);
  return firstTerm + secondTerm + thirdTerm;
}

async function ethCall(
  provider: Eip1193Provider,
  to: Address,
  data: Hex,
  blockTag: Hex,
): Promise<Hex> {
  return provider.request<Hex>({
    method: "eth_call",
    params: [{ to, data }, blockTag],
  });
}
