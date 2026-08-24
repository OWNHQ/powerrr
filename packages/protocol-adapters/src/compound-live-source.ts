import {
  ethereumAssetMetadataByAddress,
  ethereumTokenByAddress,
} from "@powerrr/configs";
import type {
  ProtocolAdapterInput,
  ProtocolAssetEvaluation,
} from "@powerrr/shared-types";
import {
  decodeFunctionResult,
  encodeFunctionData,
  formatUnits,
  getAddress,
  isAddressEqual,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import {
  mulDivDown,
  rawAmount,
  rawAmountToNumber,
  rawRatio,
  scaleRawAmount,
  USDC_DECIMALS,
} from "@powerrr/math";
import type {
  CompoundLiveSnapshot,
  RawCollateralGroup,
} from "./live-snapshots.js";

export const COMPOUND_USDC_COMET_MAINNET =
  "0xc3d688B66703497DAA19211EEdff47f25384cdc3" as const;

const SECONDS_PER_YEAR = 60 * 60 * 24 * 365;
const ZERO_BIGINT = BigInt(0);

const compoundCometAbi = parseAbi([
  "function numAssets() view returns (uint8)",
  "function getAssetInfo(uint8 i) view returns ((uint8 offset,address asset,address priceFeed,uint64 scale,uint64 borrowCollateralFactor,uint64 liquidateCollateralFactor,uint64 liquidationFactor,uint128 supplyCap))",
  "function collateralBalanceOf(address account, address asset) view returns (uint128)",
  "function borrowBalanceOf(address account) view returns (uint256)",
  "function getPrice(address priceFeed) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function totalBorrow() view returns (uint256)",
  "function getUtilization() view returns (uint256)",
  "function getBorrowRate(uint256 utilization) view returns (uint64)",
  "function baseToken() view returns (address)",
  "function baseScale() view returns (uint64)",
  "function priceScale() view returns (uint64)",
  "function baseBorrowMin() view returns (uint256)",
  "function isSupplyPaused() view returns (bool)",
  "function isWithdrawPaused() view returns (bool)",
  "function totalsCollateral(address asset) view returns (uint128 totalSupplyAsset,uint128 _reserved)",
]);
const erc20Abi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
]);

export type CompoundLiveRpcClient = {
  request<TResult>(request: {
    method: string;
    params?: unknown[];
  }): Promise<TResult>;
};

export type CompoundLiveSnapshotInput = ProtocolAdapterInput & {
  rpc: CompoundLiveRpcClient;
  cometAddress?: Address;
};

type CompoundAssetInfo = {
  offset: number;
  asset: Address;
  priceFeed: Address;
  scale: bigint;
  borrowCollateralFactor: bigint;
  liquidateCollateralFactor: bigint;
  liquidationFactor: bigint;
  supplyCap: bigint;
};

export async function loadCompoundUsdcCometSnapshot(
  input: CompoundLiveSnapshotInput,
): Promise<CompoundLiveSnapshot & { kind: "compound" }> {
  const fetchedAt = input.now ?? new Date();
  const freshnessSeconds = sourceAgeSeconds(fetchedAt, input.blockTimestamp);
  const cometAddress = input.cometAddress ?? COMPOUND_USDC_COMET_MAINNET;
  const blockNumberHex = input.asOfBlock
    ? toHexBlockNumber(input.asOfBlock)
    : await input.rpc.request<Hex>({ method: "eth_blockNumber" });
  // Resolve `latest` once, then pin Comet, price-feed, and ERC-20 reads.
  const blockTag = blockNumberHex;
  const [
    numAssets,
    baseToken,
    baseScale,
    priceScale,
    utilization,
    existingDebtRaw,
    baseBorrowMinRaw,
    supplyPaused,
    withdrawPaused,
  ] = await Promise.all([
    callComet<number>(input.rpc, cometAddress, "numAssets", [], blockTag),
    callComet<Address>(input.rpc, cometAddress, "baseToken", [], blockTag),
    callComet<bigint>(input.rpc, cometAddress, "baseScale", [], blockTag),
    callComet<bigint>(input.rpc, cometAddress, "priceScale", [], blockTag),
    callComet<bigint>(input.rpc, cometAddress, "getUtilization", [], blockTag),
    input.mode === "existing-position"
      ? callComet<bigint>(
          input.rpc,
          cometAddress,
          "borrowBalanceOf",
          [input.address],
          blockTag,
        )
      : Promise.resolve(ZERO_BIGINT),
    callComet<bigint>(input.rpc, cometAddress, "baseBorrowMin", [], blockTag),
    callComet<boolean>(input.rpc, cometAddress, "isSupplyPaused", [], blockTag),
    callComet<boolean>(
      input.rpc,
      cometAddress,
      "isWithdrawPaused",
      [],
      blockTag,
    ),
  ]);
  if (supplyPaused || withdrawPaused) {
    throw new Error(
      `Compound III operations are paused (${supplyPaused ? "supply" : "withdraw"})`,
    );
  }
  const borrowRate = await callComet<bigint>(
    input.rpc,
    cometAddress,
    "getBorrowRate",
    [utilization],
    blockTag,
  );
  const spendableBaseRaw = await callErc20Balance(
    input.rpc,
    baseToken,
    cometAddress,
    blockTag,
  );
  const assets = await Promise.all(
    Array.from({ length: numAssets }, (_, index) =>
      callComet<CompoundAssetInfo>(
        input.rpc,
        cometAddress,
        "getAssetInfo",
        [index],
        blockTag,
      ),
    ),
  );
  const selectedTokens = new Set(
    (
      input.selectedCollateralTokens ??
      input.portfolio.map((asset) => asset.token)
    ).map((token) => token.toLowerCase()),
  );
  const collateral = (
    await Promise.all(
      assets.map(async (asset) => {
        const balanceRaw =
          input.mode === "existing-position"
            ? await callComet<bigint>(
                input.rpc,
                cometAddress,
                "collateralBalanceOf",
                [input.address, asset.asset],
                blockTag,
              )
            : walletBalanceFor(input, asset.asset);

        if (balanceRaw <= ZERO_BIGINT) {
          return null;
        }

        const [priceRaw, collateralTotals] = await Promise.all([
          callComet<bigint>(
            input.rpc,
            cometAddress,
            "getPrice",
            [asset.priceFeed],
            blockTag,
          ),
          asset.supplyCap > ZERO_BIGINT
            ? callComet<readonly [bigint, bigint]>(
                input.rpc,
                cometAddress,
                "totalsCollateral",
                [asset.asset],
                blockTag,
              )
            : Promise.resolve([ZERO_BIGINT, ZERO_BIGINT] as const),
        ]);
        const currentSupplyRaw = collateralTotals[0];
        const remainingSupplyRaw =
          input.mode === "existing-position" || asset.supplyCap === ZERO_BIGINT
            ? balanceRaw
            : asset.supplyCap > currentSupplyRaw
              ? asset.supplyCap - currentSupplyRaw
              : ZERO_BIGINT;
        const usableBalanceRaw =
          balanceRaw < remainingSupplyRaw ? balanceRaw : remainingSupplyRaw;
        if (
          priceRaw <= ZERO_BIGINT ||
          asset.borrowCollateralFactor <= ZERO_BIGINT ||
          asset.liquidateCollateralFactor <= ZERO_BIGINT ||
          usableBalanceRaw <= ZERO_BIGINT
        ) {
          return null;
        }
        const metadata = tokenMetadataFor(asset.asset);
        const protocolDecimals = decimalsFromScale(asset.scale);
        if (
          BigInt(10) ** BigInt(protocolDecimals) !== asset.scale ||
          protocolDecimals !== metadata.decimals
        ) {
          return null;
        }
        const amount = Number(formatUnits(usableBalanceRaw, protocolDecimals));
        const priceUsd = Number(
          formatUnits(priceRaw, decimalsFromScale(priceScale)),
        );
        const valueUsd = amount * priceUsd;
        if (!Number.isFinite(valueUsd) || valueUsd <= 0) {
          return null;
        }

        return {
          token: getAddress(asset.asset) as `0x${string}`,
          symbol: metadata.symbol,
          assetAddress: getAddress(asset.asset) as `0x${string}`,
          scale: asset.scale,
          priceRaw,
          currentSupplyRaw,
          remainingSupplyRaw,
          supplyCapRaw: asset.supplyCap,
          valueUsd,
          valueExact: rawAmount(
            mulDivDown(
              usableBalanceRaw * priceRaw,
              10n ** BigInt(USDC_DECIMALS),
              asset.scale * priceScale,
            ),
            USDC_DECIMALS,
          ),
          borrowCollateralFactor: Number(
            formatUnits(asset.borrowCollateralFactor, 18),
          ),
          liquidateCollateralFactor: Number(
            formatUnits(asset.liquidateCollateralFactor, 18),
          ),
          borrowCollateralFactorExact: rawRatio(
            asset.borrowCollateralFactor,
            10n ** 18n,
          ),
          liquidateCollateralFactorExact: rawRatio(
            asset.liquidateCollateralFactor,
            10n ** 18n,
          ),
        };
      }),
    )
  ).filter((item): item is NonNullable<typeof item> => item !== null);
  const baseDecimals = decimalsFromScale(baseScale);
  const availableLiquidityExact = rawAmount(
    scaleRawAmount(spendableBaseRaw, baseDecimals, USDC_DECIMALS),
    USDC_DECIMALS,
  );
  const existingDebtExact = rawAmount(
    scaleRawAmount(existingDebtRaw, baseDecimals, USDC_DECIMALS),
    USDC_DECIMALS,
  );
  const minimumBorrowExact = rawAmount(
    scaleRawAmount(baseBorrowMinRaw, baseDecimals, USDC_DECIMALS),
    USDC_DECIMALS,
  );
  const availableLiquidityUsd = rawAmountToNumber(availableLiquidityExact);
  const existingDebtUsd = rawAmountToNumber(existingDebtExact);
  const minimumBorrowUsd = rawAmountToNumber(minimumBorrowExact);
  const indicativeApr = Number(formatUnits(borrowRate, 18)) * SECONDS_PER_YEAR;
  const assetEvaluations = input.portfolio.map((portfolioAsset) => {
    const listed = assets.find((asset) =>
      isAddressEqual(
        asset.asset,
        (portfolioAsset.protocolAssetToken ?? portfolioAsset.token) as Address,
      ),
    );
    const selected = selectedTokens.has(portfolioAsset.token.toLowerCase());
    const selectionStatus = portfolioAsset.requiredAction
      ? "unselectable"
      : selected
        ? "selected"
        : "not-selected";
    const balanceUsd =
      Number(portfolioAsset.balance) *
      Math.max(0, portfolioAsset.marketPriceUsd ?? 0);
    if (!listed) {
      return {
        token: portfolioAsset.token,
        symbol: portfolioAsset.symbol,
        ...(balanceUsd > 0 ? { balanceUsd } : {}),
        selectionStatus,
        eligibilityStatus: "unsupported",
        reasonCodes: ["NOT_LISTED"],
        reason: `${portfolioAsset.symbol} is not a collateral asset in this Compound market.`,
      } satisfies ProtocolAssetEvaluation;
    }
    const included = collateral.find((item) =>
      isAddressEqual(item.token as Address, listed.asset),
    );
    const factorsValid =
      listed.borrowCollateralFactor > ZERO_BIGINT &&
      listed.liquidateCollateralFactor > ZERO_BIGINT;
    const conversionRequired = Boolean(portfolioAsset.requiredAction);
    const supported = factorsValid;
    const temporarilyUnavailable = selected && supported && !included;
    const protocolSymbol = tokenMetadataFor(listed.asset).symbol;
    return {
      token: portfolioAsset.token,
      symbol: portfolioAsset.symbol,
      ...(balanceUsd > 0 ? { balanceUsd } : {}),
      selectionStatus,
      eligibilityStatus: !factorsValid
        ? "unsupported"
        : conversionRequired
          ? "supported"
          : temporarilyUnavailable
            ? "temporarily-unavailable"
            : selected
              ? "included"
              : "supported",
      reasonCodes: !factorsValid
        ? ["ZERO_LTV"]
        : conversionRequired
          ? ["CONVERSION_REQUIRED"]
          : temporarilyUnavailable
            ? ["MARKET_STATE_UNAVAILABLE"]
            : [selected ? "INCLUDED" : "SUPPORTED_NOT_SELECTED"],
      reason: !factorsValid
        ? "This market currently assigns the asset a zero collateral factor."
        : conversionRequired
          ? `${portfolioAsset.symbol} must be converted to ${protocolSymbol} before supply. Its ${protocolSymbol}-equivalent value is included in this estimate.`
          : temporarilyUnavailable
            ? "The asset is listed, but protocol price or supply-cap checks prevented inclusion."
            : selected
              ? "Included in this protocol estimate."
              : "Supported by this protocol, but not selected as collateral.",
      ltv: Number(formatUnits(listed.borrowCollateralFactor, 18)),
      liquidationThreshold: Number(
        formatUnits(listed.liquidateCollateralFactor, 18),
      ),
      ...(portfolioAsset.requiredAction
        ? {
            requiredAction: `Convert ${portfolioAsset.symbol} before supplying collateral.`,
          }
        : {}),
    } satisfies ProtocolAssetEvaluation;
  });
  const rawCollateral: RawCollateralGroup[] = assets.flatMap((asset) => {
    const matching = collateral.find((item) =>
      isAddressEqual(item.token as Address, asset.asset),
    );
    if (!matching) return [];
    const metadata = tokenMetadataFor(asset.asset);
    const protocolDecimals = decimalsFromScale(asset.scale);
    const sources = input.portfolio
      .filter(
        (item) =>
          isAddressEqual(
            (item.protocolAssetToken ?? item.token) as Address,
            asset.asset,
          ) &&
          BigInt(item.protocolBalanceRaw ?? item.balanceRaw ?? "0") >
            ZERO_BIGINT,
      )
      .map((item) => ({
        token: item.token,
        symbol: item.symbol,
        convertedBalanceRaw: item.protocolBalanceRaw ?? item.balanceRaw,
      }));
    if (
      !sources.length ||
      protocolDecimals !== metadata.decimals ||
      asset.borrowCollateralFactor <= ZERO_BIGINT ||
      asset.liquidateCollateralFactor <= ZERO_BIGINT
    ) {
      return [];
    }
    return [
      {
        protocolToken: getAddress(asset.asset) as `0x${string}`,
        protocolSymbol: metadata.symbol,
        protocolDecimals,
        sources,
        ...(asset.supplyCap > ZERO_BIGINT
          ? {
              remainingSupplyRaw: matching.remainingSupplyRaw.toString(),
              supplyCapRaw: asset.supplyCap.toString(),
              currentSupplyRaw: matching.currentSupplyRaw.toString(),
            }
          : {}),
        priceRaw: matching.priceRaw.toString(),
        valueNumeratorScale: (10n ** BigInt(USDC_DECIMALS)).toString(),
        valueDenominator: (asset.scale * priceScale).toString(),
        ltv: rawRatio(asset.borrowCollateralFactor, 10n ** 18n),
        liquidationThreshold: rawRatio(
          asset.liquidateCollateralFactor,
          10n ** 18n,
        ),
        active: true,
        frozen: false,
        paused: false,
        collateralEnabled: true,
      },
    ];
  });

  return {
    kind: "compound",
    protocolId: "compound-iii",
    protocolLabel: "Compound III",
    familyId: "compound-iii",
    familyLabel: "Compound III",
    chainId: input.chainId,
    mode: input.mode,
    targetBorrowAsset: input.targetBorrowAssets[0] ?? "USDC",
    rateType: "variable",
    indicativeApr,
    annualRateValue: indicativeApr,
    annualRateExact: rawRatio(
      borrowRate * BigInt(SECONDS_PER_YEAR),
      10n ** 18n,
    ),
    annualRateTransform: "ratio",
    annualRateConvention: "apr",
    rateSourceId: "compound-iii:usdc-comet-borrow-rate",
    existingDebtUsd,
    availableLiquidityUsd,
    source: "Compound III USDC Comet on-chain reads",
    sourceType: "on-chain",
    ...(freshnessSeconds === undefined ? {} : { freshnessSeconds }),
    fetchedAt: fetchedAt.toISOString(),
    ...(input.blockTimestamp
      ? {
          observedAt: input.blockTimestamp,
          blockTimestamp: input.blockTimestamp,
        }
      : {}),
    blockNumber: String(BigInt(blockNumberHex)),
    ...(input.now ? { now: input.now } : {}),
    assumptions: [
      `Read Compound III USDC Comet proxy ${cometAddress}.`,
      "Collateral values use Comet price feeds, collateral token scale, and Comet factor scale.",
      "Available liquidity is the spendable base-token balance held by the Comet contract, interpreted in USDC units.",
    ],
    warnings:
      input.mode === "wallet-estimate"
        ? [
            "Compound wallet-estimate mode uses wallet token balances; existing-position mode reads supplied Comet collateral balances.",
          ]
        : [],
    confidencePenalties: {
      sourcePenalty: 2,
      stalenessPenalty: 0,
      fallbackPenalty: 0,
      complexityPenalty: 3,
      liquidityPenalty: 0,
    },
    safetyProfile: input.safetyProfile,
    minimumBorrowUsd,
    minimumBorrowExact,
    existingDebtExact,
    availableLiquidityExact,
    assetEvaluations,
    collateral,
    rawCollateral,
  };
}

function sourceAgeSeconds(
  now: Date,
  observedAt: string | undefined,
): number | undefined {
  if (!observedAt) return undefined;
  const observedTime = new Date(observedAt).getTime();
  if (!Number.isFinite(observedTime)) return undefined;
  return Math.max(0, Math.floor((now.getTime() - observedTime) / 1_000));
}

async function callErc20Balance(
  rpc: CompoundLiveRpcClient,
  token: Address,
  account: Address,
  blockTag: string,
): Promise<bigint> {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account],
  });
  const result = await rpc.request<Hex>({
    method: "eth_call",
    params: [{ to: token, data }, blockTag],
  });
  return decodeFunctionResult({
    abi: erc20Abi,
    functionName: "balanceOf",
    data: result,
  });
}

async function callComet<TResult>(
  rpc: CompoundLiveRpcClient,
  cometAddress: Address,
  functionName: string,
  args: unknown[],
  blockTag: string,
): Promise<TResult> {
  const data = encodeFunctionData({
    abi: compoundCometAbi,
    functionName,
    args,
  } as never);
  const result = await rpc.request<Hex>({
    method: "eth_call",
    params: [
      {
        to: cometAddress,
        data,
      },
      blockTag,
    ],
  });

  return decodeFunctionResult({
    abi: compoundCometAbi,
    functionName,
    data: result,
  } as never) as TResult;
}

function toHexBlockNumber(value: string): Hex {
  return `0x${BigInt(value).toString(16)}`;
}

function walletBalanceFor(input: ProtocolAdapterInput, asset: Address): bigint {
  const matches = input.portfolio.filter((item) =>
    isAddressEqual((item.protocolAssetToken ?? item.token) as Address, asset),
  );
  return matches.reduce(
    (sum, match) => sum + BigInt(match.protocolBalanceRaw ?? match.balanceRaw),
    ZERO_BIGINT,
  );
}

function tokenMetadataFor(asset: Address): {
  symbol: string;
  decimals: number;
} {
  const token = ethereumAssetMetadataByAddress(asset);
  const registryToken = ethereumTokenByAddress(asset);
  if (!token && !registryToken) {
    throw new Error(
      `Compound returned collateral outside the reviewed registry: ${asset}`,
    );
  }

  return {
    symbol: token?.symbol ?? registryToken!.symbol,
    decimals: token?.decimals ?? registryToken!.decimals,
  };
}

function decimalsFromScale(scale: bigint): number {
  const value = scale.toString();
  if (!/^10*$/.test(value)) {
    return 0;
  }

  return value.length - 1;
}
