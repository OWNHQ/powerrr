import {
  ETHEREUM_MORPHO_USDC_MARKET_MANIFEST_VERSION,
  MORPHO_BLUE,
  ethereumMorphoUsdcMarketsV1,
  type EthereumMorphoUsdcMarket,
} from "@powerrr/configs";
import type {
  MorphoLiveMarketSnapshot,
  MorphoLiveSnapshot,
} from "@powerrr/protocol-adapters";
import type {
  PortfolioAsset,
  ProtocolAssetEvaluation,
  ReadReceipt,
} from "@powerrr/shared-types";
import {
  decodeFunctionResult,
  encodeFunctionData,
  formatUnits,
  isAddressEqual,
  toHex,
  type Address,
} from "viem";
import {
  rawAmount,
  rawAmountToNumber,
  rawRatio,
  scaleRawAmount,
  USDC_DECIMALS,
} from "@powerrr/math";
import {
  multicallAtPinnedBlock,
  type Eip1193Provider,
  type PinnedCallResult,
} from "./static-discovery";

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

type MarketParams = {
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  irm: Address;
  lltv: bigint;
};

type RelevantMarket = {
  manifest: EthereumMorphoUsdcMarket;
  walletAssets: PortfolioAsset[];
};

type DecodedMarket = RelevantMarket & {
  params: MarketParams;
  state: MarketState;
  oraclePrice: bigint;
  accruedState: MarketState;
  borrowRatePerSecond: bigint;
};

export async function loadStaticMorphoSnapshot(input: {
  provider: Eip1193Provider;
  portfolio: PortfolioAsset[];
  receipt: ReadReceipt;
}): Promise<MorphoLiveSnapshot & { kind: "morpho" }> {
  const blockTag = toHex(BigInt(input.receipt.blockNumber));
  const selectedTokens = new Set(
    input.portfolio.map((asset) => asset.token.toLowerCase()),
  );

  const relevantMarkets: RelevantMarket[] = ethereumMorphoUsdcMarketsV1.flatMap(
    (manifest) => {
      const walletAssets = input.portfolio.filter(
        (asset) =>
          positiveRawBalance(asset) &&
          isAddressEqual(
            (asset.protocolAssetToken ?? asset.token) as Address,
            manifest.collateralToken,
          ),
      );
      return walletAssets.length ? [{ manifest, walletAssets }] : [];
    },
  );

  const identityAndState = await multicallAtPinnedBlock(
    input.provider,
    relevantMarkets.flatMap(({ manifest }) => [
      {
        target: MORPHO_BLUE,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: morphoAbi,
          functionName: "idToMarketParams",
          args: [manifest.marketId],
        }),
      },
      {
        target: MORPHO_BLUE,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: morphoAbi,
          functionName: "market",
          args: [manifest.marketId],
        }),
      },
    ]),
    blockTag,
  );
  const verified = relevantMarkets.flatMap((relevant, index) => {
    try {
      const params = decodeAndVerifyParams(
        relevant.manifest,
        identityAndState[index * 2],
      );
      const state = decodeMarketState(identityAndState[index * 2 + 1]);
      return [{ ...relevant, params, state }];
    } catch {
      return [];
    }
  });

  const oracleAndStoredRates = await multicallAtPinnedBlock(
    input.provider,
    verified.flatMap(({ params, state }) => [
      {
        target: params.oracle,
        allowFailure: true,
        callData: encodeFunctionData({ abi: oracleAbi, functionName: "price" }),
      },
      {
        target: params.irm,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: irmAbi,
          functionName: "borrowRateView",
          args: [params, state],
        }),
      },
    ]),
    blockTag,
  );
  const timestamp = blockTimestampSeconds(input.receipt.blockTimestamp);
  const priced = verified.flatMap((market, index) => {
    try {
      const oraclePrice = decodeOraclePrice(oracleAndStoredRates[index * 2]);
      const storedRate = decodeBorrowRate(oracleAndStoredRates[index * 2 + 1]);
      const accruedState = accrueMarketStateLocally(
        market.state,
        storedRate,
        timestamp,
      );
      return [{ ...market, oraclePrice, accruedState }];
    } catch {
      return [];
    }
  });

  const accruedRates = await multicallAtPinnedBlock(
    input.provider,
    priced.map(({ params, accruedState }) => ({
      target: params.irm,
      allowFailure: true,
      callData: encodeFunctionData({
        abi: irmAbi,
        functionName: "borrowRateView",
        args: [params, accruedState],
      }),
    })),
    blockTag,
  );
  const decodedMarkets: DecodedMarket[] = priced.flatMap((market, index) => {
    try {
      return [
        {
          ...market,
          borrowRatePerSecond: decodeBorrowRate(accruedRates[index]),
        },
      ];
    } catch {
      return [];
    }
  });

  const markets: MorphoLiveMarketSnapshot[] = decodedMarkets.flatMap(
    ({
      manifest,
      walletAssets,
      oraclePrice,
      accruedState,
      borrowRatePerSecond,
    }) => {
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
      const valueExact = rawAmount(
        scaleRawAmount(
          collateralValueLoanRaw,
          manifest.loanDecimals,
          USDC_DECIMALS,
        ),
        USDC_DECIMALS,
      );
      const liquidityRaw =
        accruedState.totalSupplyAssets > accruedState.totalBorrowAssets
          ? accruedState.totalSupplyAssets - accruedState.totalBorrowAssets
          : 0n;
      if (!Number.isFinite(valueUsd) || valueUsd <= 0) return [];
      const lltv = BigInt(manifest.lltv);
      return [
        {
          token: walletAssets[0]!.token,
          symbol: [...new Set(walletAssets.map((asset) => asset.symbol))].join(
            " + ",
          ),
          valueUsd,
          valueExact,
          lltv: Number(lltv) / Number(WAD),
          marketId: manifest.marketId,
          availableLiquidityUsd: Number(
            formatUnits(liquidityRaw, manifest.loanDecimals),
          ),
          availableLiquidityExact: rawAmount(
            scaleRawAmount(liquidityRaw, manifest.loanDecimals, USDC_DECIMALS),
            USDC_DECIMALS,
          ),
          borrowApy: annualApy(borrowRatePerSecond),
          loanToken: manifest.loanToken,
          collateralToken: manifest.collateralToken,
          oracle: manifest.oracle,
          irm: manifest.irm,
          totalSupplyAssets: rawAmount(
            accruedState.totalSupplyAssets,
            manifest.loanDecimals,
          ),
          totalBorrowAssets: rawAmount(
            accruedState.totalBorrowAssets,
            manifest.loanDecimals,
          ),
          lastUpdate: accruedState.lastUpdate.toString(),
          fee: rawRatio(accruedState.fee, WAD),
          borrowRatePerSecond: rawRatio(borrowRatePerSecond, WAD),
          collateralAvailableExact: rawAmount(
            collateralRaw,
            manifest.collateralDecimals,
          ),
          rawCollateral: {
            protocolToken: manifest.collateralToken,
            protocolSymbol: manifest.collateralSymbol,
            protocolDecimals: manifest.collateralDecimals,
            sources: walletAssets.map((asset) => ({
              token: asset.token,
              symbol: asset.symbol,
              convertedBalanceRaw: asset.protocolBalanceRaw ?? asset.balanceRaw,
            })),
            priceRaw: oraclePrice.toString(),
            valueNumeratorScale: "1",
            valueDenominator: ORACLE_PRICE_SCALE.toString(),
            ltv: rawRatio(lltv, WAD),
            liquidationThreshold: rawRatio(lltv, WAD),
            marketId: manifest.marketId,
          },
          priceObservedAt: input.receipt.blockTimestamp,
          freshnessSeconds: input.receipt.blockAgeSeconds,
        },
      ];
    },
  );

  const assetEvaluations = input.portfolio.map((asset) => {
    const manifests = ethereumMorphoUsdcMarketsV1.filter((market) =>
      isAddressEqual(
        (asset.protocolAssetToken ?? asset.token) as Address,
        market.collateralToken,
      ),
    );
    const manifest = manifests[0];
    const selected = selectedTokens.has(asset.token.toLowerCase());
    const selectedMarket = markets.find((market) =>
      manifests.some((candidate) => candidate.marketId === market.marketId),
    );
    const balanceUsd =
      Number(asset.balance) * Math.max(0, asset.marketPriceUsd ?? 0);
    if (!manifest) {
      return {
        token: asset.token,
        symbol: asset.symbol,
        ...(balanceUsd > 0 ? { balanceUsd } : {}),
        selectionStatus: selected ? "selected" : "not-selected",
        eligibilityStatus: "unsupported",
        reasonCodes: ["NO_REVIEWED_MARKET"],
        reason: "No reviewed USDC Morpho market is pinned for this collateral.",
      } satisfies ProtocolAssetEvaluation;
    }
    const conversionRequired = Boolean(asset.requiredAction);
    return {
      token: asset.token,
      symbol: asset.symbol,
      ...(balanceUsd > 0 ? { balanceUsd } : {}),
      selectionStatus: conversionRequired
        ? "unselectable"
        : selected
          ? "selected"
          : "not-selected",
      eligibilityStatus: conversionRequired
        ? selectedMarket
          ? "supported"
          : "temporarily-unavailable"
        : selected
          ? selectedMarket
            ? "included"
            : "temporarily-unavailable"
          : "supported",
      reasonCodes: conversionRequired
        ? ["CONVERSION_REQUIRED"]
        : selected
          ? selectedMarket
            ? ["INCLUDED"]
            : ["MARKET_STATE_UNAVAILABLE"]
          : ["SUPPORTED_NOT_SELECTED"],
      reason: conversionRequired
        ? selectedMarket
          ? `${asset.symbol} must be converted to ${manifest.collateralSymbol} before supply. Its ${manifest.collateralSymbol}-equivalent value is included in this estimate.`
          : `Convert ${asset.symbol} to ${manifest.collateralSymbol} before supply; the reviewed market did not expose usable liquidity and price state.`
        : selected
          ? selectedMarket
            ? "Included in this market estimate."
            : "The reviewed market did not expose usable liquidity and price state."
          : "A reviewed market supports this asset, but it is not selected.",
      ltv: Math.max(
        ...manifests.map((market) => Number(market.lltv) / Number(WAD)),
      ),
      liquidationThreshold: Math.max(
        ...manifests.map((market) => Number(market.lltv) / Number(WAD)),
      ),
      ...(conversionRequired
        ? { requiredAction: `Convert to ${manifest.collateralSymbol}` }
        : {}),
    } satisfies ProtocolAssetEvaluation;
  });

  const availableLiquidityExact = rawAmount(
    markets.reduce(
      (sum, market) => sum + BigInt(market.availableLiquidityExact.raw),
      0n,
    ),
    USDC_DECIMALS,
  );
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
    availableLiquidityUsd: rawAmountToNumber(availableLiquidityExact),
    existingDebtExact: rawAmount(0n, USDC_DECIMALS),
    availableLiquidityExact,
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
    warnings:
      relevantMarkets.length === markets.length
        ? []
        : [
            `${relevantMarkets.length - markets.length} relevant Morpho market${relevantMarkets.length - markets.length === 1 ? " was" : "s were"} unavailable at the pinned block; other markets remain usable.`,
          ],
    confidencePenalties: {
      sourcePenalty: 0,
      stalenessPenalty: input.receipt.blockAgeSeconds > 60 ? 5 : 0,
      fallbackPenalty: 0,
      complexityPenalty: 4,
      liquidityPenalty: 0,
    },
    safetyProfile: "balanced",
    assetEvaluations,
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

function decodeAndVerifyParams(
  manifest: EthereumMorphoUsdcMarket,
  result: PinnedCallResult | undefined,
): MarketParams {
  if (!result?.success) throw new Error("Morpho market parameters unavailable");
  const decoded = decodeFunctionResult({
    abi: morphoAbi,
    functionName: "idToMarketParams",
    data: result.returnData,
  });
  const [loanToken, collateralToken, oracle, irm, lltv] = decoded;
  if (
    !isAddressEqual(loanToken, manifest.loanToken) ||
    !isAddressEqual(collateralToken, manifest.collateralToken) ||
    !isAddressEqual(oracle, manifest.oracle) ||
    !isAddressEqual(irm, manifest.irm) ||
    lltv !== BigInt(manifest.lltv)
  ) {
    throw new Error(
      "A checked-in market ID did not match its onchain parameters.",
    );
  }
  return { loanToken, collateralToken, oracle, irm, lltv };
}

function decodeMarketState(result: PinnedCallResult | undefined): MarketState {
  if (!result?.success) throw new Error("Morpho market state unavailable");
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
    data: result.returnData,
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

function decodeOraclePrice(result: PinnedCallResult | undefined): bigint {
  if (!result?.success) throw new Error("Morpho oracle unavailable");
  const price = decodeFunctionResult({
    abi: oracleAbi,
    functionName: "price",
    data: result.returnData,
  });
  if (price <= 0n)
    throw new Error("The checked-in market oracle returned no price.");
  return price;
}

function decodeBorrowRate(result: PinnedCallResult | undefined): bigint {
  if (!result?.success) throw new Error("Morpho IRM unavailable");
  const ratePerSecond = decodeFunctionResult({
    abi: irmAbi,
    functionName: "borrowRateView",
    data: result.returnData,
  });
  const annualApr = (Number(ratePerSecond) / Number(WAD)) * SECONDS_PER_YEAR;
  if (!Number.isFinite(annualApr) || annualApr < 0 || annualApr > 20) {
    throw new Error("The Morpho IRM returned an invalid borrow rate.");
  }
  return ratePerSecond;
}

function accrueMarketStateLocally(
  market: MarketState,
  ratePerSecond: bigint,
  timestamp: bigint,
): MarketState {
  if (timestamp <= market.lastUpdate) return market;
  if (market.totalBorrowAssets <= 0n)
    return { ...market, lastUpdate: timestamp };
  const elapsed = timestamp - market.lastUpdate;
  const compoundedRate = wTaylorCompounded(ratePerSecond, elapsed);
  const interest = (market.totalBorrowAssets * compoundedRate) / WAD;

  return {
    ...market,
    totalSupplyAssets: market.totalSupplyAssets + interest,
    totalBorrowAssets: market.totalBorrowAssets + interest,
    lastUpdate: timestamp,
  };
}

function blockTimestampSeconds(blockTimestamp: string): bigint {
  const timestampMs = new Date(blockTimestamp).getTime();
  if (!Number.isFinite(timestampMs)) {
    throw new Error(
      "The selected block timestamp is invalid for Morpho accrual.",
    );
  }
  return BigInt(Math.floor(timestampMs / 1_000));
}

function annualApy(ratePerSecond: bigint): number {
  return (
    Number(wTaylorCompounded(ratePerSecond, BigInt(SECONDS_PER_YEAR))) /
    Number(WAD)
  );
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
