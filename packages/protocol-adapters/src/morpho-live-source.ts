import type { GraphQlClient } from "@powerrr/clients";
import type {
  PortfolioAsset,
  ProtocolAdapterInput,
} from "@powerrr/shared-types";
import { formatUnits, getAddress, isAddressEqual, type Address } from "viem";
import type {
  MorphoLiveMarketSnapshot,
  MorphoLiveSnapshot,
} from "./live-snapshots.js";

const MARKETS_QUERY = `
  query PowerrrMorphoMarkets($collateral: [String!], $loan: [String!]) {
    markets(
      first: 100
      orderBy: SupplyAssetsUsd
      orderDirection: Desc
      where: {
        chainId_in: [1]
        listed: true
        collateralAssetAddress_in: $collateral
        loanAssetAddress_in: $loan
      }
    ) {
      items {
        marketId
        lltv
        loanAsset { address symbol }
        collateralAsset {
          address
          symbol
          price(maxLag: 1) { usd timestamp }
        }
        state { liquidityAssetsUsd borrowApy }
      }
    }
  }
`;

const POSITIONS_QUERY = `
  query PowerrrMorphoPositions($user: [String!]) {
    marketPositions(
      first: 100
      where: { chainId_in: [1], userAddress_in: $user }
    ) {
      items {
        market {
          marketId
          lltv
          loanAsset { address symbol }
          collateralAsset { address symbol }
          state { liquidityAssetsUsd borrowApy }
        }
        state { collateralUsd borrowAssetsUsd }
      }
    }
  }
`;

type ApiMarket = {
  marketId: string;
  lltv: string | number;
  loanAsset: { address: string; symbol: string };
  collateralAsset: {
    address: string;
    symbol: string;
    price?: { usd: string | number; timestamp: string | number } | null;
  };
  state: { liquidityAssetsUsd: string | number; borrowApy: string | number };
};

type ApiPosition = {
  market: Omit<ApiMarket, "collateralAsset"> & {
    collateralAsset: { address: string; symbol: string };
  };
  state: { collateralUsd: string | number; borrowAssetsUsd: string | number };
};

export async function loadMorphoSnapshot(
  input: ProtocolAdapterInput & {
    graphQl: GraphQlClient;
  },
): Promise<MorphoLiveSnapshot & { kind: "morpho" }> {
  const target = (input.targetBorrowAssets[0] ?? "USDC").toUpperCase();
  const targetAsset =
    input.portfolio.find((asset) => asset.symbol.toUpperCase() === target) ??
    knownAsset(target);
  if (!targetAsset) {
    throw new Error(
      `Morpho live quoting does not know the ${target} loan-asset address`,
    );
  }

  const loaded =
    input.mode === "existing-position"
      ? await loadExistingPositions(input, target, input.graphQl)
      : await loadWalletMarkets(input, targetAsset, input.graphQl);
  const fetchedAt = input.now ?? new Date();
  const measurableAges = loaded.markets
    .map((market) => market.freshnessSeconds)
    .filter((value): value is number => value !== undefined);
  const freshnessSeconds = measurableAges.length
    ? Math.max(...measurableAges)
    : undefined;

  return {
    kind: "morpho",
    protocolId: "morpho-blue",
    protocolLabel: "Morpho Blue",
    familyId: "morpho-blue",
    familyLabel: "Morpho Blue",
    chainId: input.chainId,
    mode: input.mode,
    targetBorrowAsset: target,
    rateType: "variable",
    indicativeApr: null,
    annualRateValue: null,
    annualRateConvention: "apy",
    rateSourceId: "morpho-blue:selected-market-borrow-apy",
    existingDebtUsd: loaded.existingDebtUsd,
    availableLiquidityUsd: loaded.markets.reduce(
      (max, market) => Math.max(max, market.availableLiquidityUsd ?? 0),
      0,
    ),
    source: "Morpho official GraphQL API",
    sourceType: "official-api",
    ...(freshnessSeconds === undefined ? {} : { freshnessSeconds }),
    fetchedAt: fetchedAt.toISOString(),
    ...(input.now ? { now: input.now } : {}),
    assumptions: [
      "Only listed Ethereum markets for the requested loan asset are considered.",
      "Each isolated market is quoted separately and the highest safer capacity is displayed.",
    ],
    warnings:
      input.mode === "wallet-estimate"
        ? [
            "Wallet-estimate mode uses Morpho API asset prices and does not simulate bundler transactions or public-allocator reallocation.",
          ]
        : [],
    confidencePenalties: {
      sourcePenalty: 3,
      stalenessPenalty: freshnessSeconds && freshnessSeconds > 60 ? 8 : 1,
      fallbackPenalty: 0,
      complexityPenalty: 5,
      liquidityPenalty: 0,
    },
    safetyProfile: input.safetyProfile,
    markets: loaded.markets,
  };
}

async function loadWalletMarkets(
  input: ProtocolAdapterInput,
  targetAsset: Pick<PortfolioAsset, "token">,
  graphQl: GraphQlClient,
): Promise<{ markets: MorphoLiveMarketSnapshot[]; existingDebtUsd: number }> {
  const collateralAssets = input.portfolio.filter(
    (asset) => BigInt(asset.balanceRaw) > BigInt(0),
  );
  if (!collateralAssets.length) {
    return { markets: [], existingDebtUsd: 0 };
  }
  const response = await graphQl.request<{ markets: { items: ApiMarket[] } }>({
    query: MARKETS_QUERY,
    operationName: "PowerrrMorphoMarkets",
    variables: {
      collateral: collateralAssets.map((asset) =>
        (asset.protocolAssetToken ?? asset.token).toLowerCase(),
      ),
      loan: [targetAsset.token.toLowerCase()],
    },
  });
  const now = input.now ?? new Date();
  const markets = response.markets.items.flatMap((market) => {
    const asset = collateralAssets.find((candidate) =>
      isAddressEqual(
        (candidate.protocolAssetToken ?? candidate.token) as Address,
        market.collateralAsset.address as Address,
      ),
    );
    const priceUsd = numberValue(market.collateralAsset.price?.usd);
    const timestamp = numberValue(market.collateralAsset.price?.timestamp);
    if (!asset || priceUsd === null || priceUsd <= 0) {
      return [];
    }
    const effectiveBalance = asset.protocolBalanceRaw
      ? Number(formatUnits(BigInt(asset.protocolBalanceRaw), asset.decimals))
      : Number(asset.balance);
    const snapshot = toMarketSnapshot(
      market,
      effectiveBalance * priceUsd,
      now,
      timestamp,
    );
    return isEligibleMarketSnapshot(snapshot) ? [snapshot] : [];
  });

  return { markets, existingDebtUsd: 0 };
}

async function loadExistingPositions(
  input: ProtocolAdapterInput,
  target: string,
  graphQl: GraphQlClient,
): Promise<{ markets: MorphoLiveMarketSnapshot[]; existingDebtUsd: number }> {
  const response = await graphQl.request<{
    marketPositions: { items: ApiPosition[] };
  }>({
    query: POSITIONS_QUERY,
    operationName: "PowerrrMorphoPositions",
    variables: { user: [input.address.toLowerCase()] },
  });
  const positions = response.marketPositions.items.filter(
    (position) => position.market.loanAsset.symbol.toUpperCase() === target,
  );
  return {
    markets: positions.flatMap((position) => {
      const snapshot = toMarketSnapshot(
        position.market,
        numberValue(position.state.collateralUsd) ?? 0,
        input.now ?? new Date(),
      );
      return isEligibleMarketSnapshot(snapshot) ? [snapshot] : [];
    }),
    existingDebtUsd: positions.reduce(
      (sum, position) =>
        sum + (numberValue(position.state.borrowAssetsUsd) ?? 0),
      0,
    ),
  };
}

function toMarketSnapshot(
  market: ApiMarket | ApiPosition["market"],
  valueUsd: number,
  now: Date,
  priceTimestamp?: number | null,
): MorphoLiveMarketSnapshot {
  const priceObservedAt =
    priceTimestamp === null || priceTimestamp === undefined
      ? undefined
      : new Date(priceTimestamp * 1_000).toISOString();
  const freshnessSeconds = priceObservedAt
    ? Math.max(
        0,
        Math.floor(
          (now.getTime() - new Date(priceObservedAt).getTime()) / 1_000,
        ),
      )
    : undefined;

  return {
    token: getAddress(market.collateralAsset.address) as `0x${string}`,
    symbol: market.collateralAsset.symbol,
    valueUsd,
    lltv: normalizedRatio(market.lltv),
    marketId: market.marketId,
    availableLiquidityUsd: numberValue(market.state.liquidityAssetsUsd) ?? 0,
    borrowApy: numberValue(market.state.borrowApy),
    ...(priceObservedAt ? { priceObservedAt } : {}),
    ...(freshnessSeconds === undefined ? {} : { freshnessSeconds }),
  };
}

function normalizedRatio(value: string | number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed > 1e12) return parsed / 1e18;
  if (parsed > 1) return parsed / 10_000;
  return parsed;
}

function isEligibleMarketSnapshot(market: MorphoLiveMarketSnapshot): boolean {
  return (
    Number.isFinite(market.valueUsd) &&
    market.valueUsd > 0 &&
    Number.isFinite(market.lltv) &&
    market.lltv > 0 &&
    market.lltv <= 1 &&
    Number.isFinite(market.availableLiquidityUsd) &&
    (market.availableLiquidityUsd ?? 0) > 0 &&
    market.borrowApy !== null &&
    Number.isFinite(market.borrowApy) &&
    market.borrowApy >= 0
  );
}

function numberValue(value: string | number | null | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function knownAsset(symbol: string): Pick<PortfolioAsset, "token"> | null {
  if (symbol === "USDC") {
    return { token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" };
  }
  return null;
}
