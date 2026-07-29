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
import type { CompoundLiveSnapshot } from "./live-snapshots.js";

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
  "function baseScale() view returns (uint64)",
  "function priceScale() view returns (uint64)",
  "function baseBorrowMin() view returns (uint256)",
  "function isSupplyPaused() view returns (bool)",
  "function isWithdrawPaused() view returns (bool)",
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
    baseScale,
    priceScale,
    totalSupplyRaw,
    totalBorrowRaw,
    utilization,
    existingDebtRaw,
    baseBorrowMinRaw,
    supplyPaused,
    withdrawPaused,
  ] = await Promise.all([
    callComet<number>(input.rpc, cometAddress, "numAssets", [], blockTag),
    callComet<bigint>(input.rpc, cometAddress, "baseScale", [], blockTag),
    callComet<bigint>(input.rpc, cometAddress, "priceScale", [], blockTag),
    callComet<bigint>(input.rpc, cometAddress, "totalSupply", [], blockTag),
    callComet<bigint>(input.rpc, cometAddress, "totalBorrow", [], blockTag),
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

        const [priceRaw, currentSupplyRaw] = await Promise.all([
          callComet<bigint>(
            input.rpc,
            cometAddress,
            "getPrice",
            [asset.priceFeed],
            blockTag,
          ),
          asset.supplyCap > ZERO_BIGINT
            ? callErc20Balance(input.rpc, asset.asset, cometAddress, blockTag)
            : Promise.resolve(ZERO_BIGINT),
        ]);
        if (
          priceRaw <= ZERO_BIGINT ||
          asset.borrowCollateralFactor <= ZERO_BIGINT ||
          asset.liquidateCollateralFactor <= ZERO_BIGINT ||
          (asset.supplyCap > ZERO_BIGINT &&
            (input.mode === "wallet-estimate"
              ? currentSupplyRaw + balanceRaw
              : currentSupplyRaw) > asset.supplyCap)
        ) {
          return null;
        }
        const metadata = tokenMetadataFor(asset.asset);
        const amount = Number(formatUnits(balanceRaw, metadata.decimals));
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
          valueUsd,
          borrowCollateralFactor: Number(
            formatUnits(asset.borrowCollateralFactor, 18),
          ),
          liquidateCollateralFactor: Number(
            formatUnits(asset.liquidateCollateralFactor, 18),
          ),
        };
      }),
    )
  ).filter((item): item is NonNullable<typeof item> => item !== null);
  const availableLiquidityUsd = Math.max(
    0,
    Number(
      formatUnits(
        totalSupplyRaw > totalBorrowRaw
          ? totalSupplyRaw - totalBorrowRaw
          : ZERO_BIGINT,
        decimalsFromScale(baseScale),
      ),
    ),
  );
  const existingDebtUsd = Number(
    formatUnits(existingDebtRaw, decimalsFromScale(baseScale)),
  );
  const minimumBorrowUsd = Number(
    formatUnits(baseBorrowMinRaw, decimalsFromScale(baseScale)),
  );
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
    const supported = factorsValid && !portfolioAsset.requiredAction;
    const temporarilyUnavailable = selected && supported && !included;
    return {
      token: portfolioAsset.token,
      symbol: portfolioAsset.symbol,
      ...(balanceUsd > 0 ? { balanceUsd } : {}),
      selectionStatus,
      eligibilityStatus: !supported
        ? "unsupported"
        : temporarilyUnavailable
          ? "temporarily-unavailable"
          : selected
            ? "included"
            : "supported",
      reasonCodes: !supported
        ? [portfolioAsset.requiredAction ? "CONVERSION_REQUIRED" : "ZERO_LTV"]
        : temporarilyUnavailable
          ? ["MARKET_STATE_UNAVAILABLE"]
          : [selected ? "INCLUDED" : "SUPPORTED_NOT_SELECTED"],
      reason: !supported
        ? portfolioAsset.requiredAction
          ? "This asset must be converted before it can be supplied."
          : "This market currently assigns the asset a zero collateral factor."
        : temporarilyUnavailable
          ? "The asset is listed, but protocol price or supply-cap checks prevented inclusion."
          : selected
            ? "Included in this protocol estimate."
            : "Supported by this protocol, but not selected as collateral.",
      ltv: Number(formatUnits(listed.borrowCollateralFactor, 18)),
      liquidationThreshold: Number(
        formatUnits(listed.liquidateCollateralFactor, 18),
      ),
      ...(included ? { contributionUsd: included.valueUsd } : {}),
      ...(portfolioAsset.requiredAction
        ? {
            requiredAction: `Convert ${portfolioAsset.symbol} before supplying collateral.`,
          }
        : {}),
    } satisfies ProtocolAssetEvaluation;
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
      "Available liquidity is total supplied base minus total borrowed base, interpreted in USDC units.",
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
    assetEvaluations,
    collateral,
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
  const match = input.portfolio.find((item) =>
    isAddressEqual((item.protocolAssetToken ?? item.token) as Address, asset),
  );

  if (
    match &&
    input.selectedCollateralTokens &&
    !input.selectedCollateralTokens.some(
      (token) => token.toLowerCase() === match.token.toLowerCase(),
    )
  ) {
    return ZERO_BIGINT;
  }

  return match
    ? BigInt(match.protocolBalanceRaw ?? match.balanceRaw)
    : ZERO_BIGINT;
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
