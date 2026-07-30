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
import type { AaveLikeLiveSnapshot } from "./live-snapshots.js";
import type { CompoundLiveRpcClient } from "./compound-live-source.js";

const RAY = 1e27;
const BPS = 10_000;
const ZERO = BigInt(0);

const abi = parseAbi([
  "function getAllReservesTokens() view returns ((string symbol,address tokenAddress)[])",
  "function getReserveConfigurationData(address asset) view returns (uint256 decimals,uint256 ltv,uint256 liquidationThreshold,uint256 liquidationBonus,uint256 reserveFactor,bool usageAsCollateralEnabled,bool borrowingEnabled,bool stableBorrowRateEnabled,bool isActive,bool isFrozen)",
  "function getReserveTokensAddresses(address asset) view returns (address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress)",
  "function getUserReserveData(address asset,address user) view returns (uint256 currentATokenBalance,uint256 currentStableDebt,uint256 currentVariableDebt,uint256 principalStableDebt,uint256 scaledVariableDebt,uint256 stableBorrowRate,uint256 liquidityRate,uint40 stableRateLastUpdated,bool usageAsCollateralEnabled)",
  "function getReserveData(address asset) view returns (uint256 unbacked,uint256 accruedToTreasuryScaled,uint256 totalAToken,uint256 totalStableDebt,uint256 totalVariableDebt,uint256 liquidityRate,uint256 variableBorrowRate,uint256 stableBorrowRate,uint256 averageStableBorrowRate,uint256 liquidityIndex,uint256 variableBorrowIndex,uint40 lastUpdateTimestamp)",
  "function getReserveCaps(address asset) view returns (uint256 borrowCap,uint256 supplyCap)",
  "function getPaused(address asset) view returns (bool)",
  "function getDebtCeiling(address asset) view returns (uint256)",
  "function getAssetPrice(address asset) view returns (uint256)",
  "function BASE_CURRENCY_UNIT() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
]);

export type AaveLikeDeployment = {
  protocolId: "aave-v3" | "sparklend";
  protocolLabel: string;
  familyId: string;
  familyLabel: string;
  dataProvider: Address;
  oracle: Address;
  targetHealthFactor: number;
};

export const AAVE_V3_ETHEREUM: AaveLikeDeployment = {
  protocolId: "aave-v3",
  protocolLabel: "Aave v3 Ethereum Core",
  familyId: "aave",
  familyLabel: "Aave",
  dataProvider: "0x0a16f2FCC0D44FaE41cc54e079281D84A363bECD",
  oracle: "0x54586bE62E3c3580375aE3723C145253060Ca0C2",
  targetHealthFactor: 1.35,
};

export const SPARKLEND_ETHEREUM: AaveLikeDeployment = {
  protocolId: "sparklend",
  protocolLabel: "SparkLend Ethereum",
  familyId: "sparklend",
  familyLabel: "SparkLend",
  dataProvider: "0xFc21d6d146E6086B8359705C8b28512a983db0cb",
  oracle: "0x8105f69D9C41644c6A0803fDA7D03Aa70996cFD9",
  targetHealthFactor: 1.4,
};

type ReserveToken = { symbol: string; tokenAddress: Address };
type Configuration = readonly [
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
];
type UserReserve = readonly [
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  number,
  boolean,
];
type ReserveData = readonly [
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  number,
];
type ReserveCaps = readonly [bigint, bigint];

export async function loadAaveLikeSnapshot(
  input: ProtocolAdapterInput & {
    rpc: CompoundLiveRpcClient;
    deployment: AaveLikeDeployment;
  },
): Promise<AaveLikeLiveSnapshot & { kind: "aave-like" }> {
  const fetchedAt = input.now ?? new Date();
  const freshnessSeconds = sourceAgeSeconds(fetchedAt, input.blockTimestamp);
  const blockHex = input.asOfBlock
    ? (`0x${BigInt(input.asOfBlock).toString(16)}` as Hex)
    : await input.rpc.request<Hex>({ method: "eth_blockNumber" });
  // Resolve `latest` once, then pin every dependent read to that exact block.
  const blockTag = blockHex;
  const [rawReserves, baseCurrencyUnit] = await Promise.all([
    call<unknown>(
      input.rpc,
      input.deployment.dataProvider,
      "getAllReservesTokens",
      [],
      blockTag,
    ),
    call<bigint>(
      input.rpc,
      input.deployment.oracle,
      "BASE_CURRENCY_UNIT",
      [],
      blockTag,
    ),
  ]);
  const reserves = normalizeReserveTokens(rawReserves);
  const targetSymbol = input.targetBorrowAssets[0] ?? "USDC";
  const target = reserves.find(
    (reserve) => reserve.symbol.toUpperCase() === targetSymbol.toUpperCase(),
  );
  if (!target) {
    throw new Error(
      `${input.deployment.protocolLabel} does not expose a ${targetSymbol} reserve`,
    );
  }

  const walletAssets = new Map(
    input.portfolio.map((asset) => [
      getAddress((asset.protocolAssetToken ?? asset.token) as Address),
      asset,
    ]),
  );
  const selectedTokens = new Set(
    (
      input.selectedCollateralTokens ??
      input.portfolio.map((asset) => asset.token)
    ).map((token) => token.toLowerCase()),
  );
  const candidateReserves =
    input.mode === "wallet-estimate"
      ? reserves.filter((reserve) =>
          [...walletAssets.keys()].some((token) =>
            isAddressEqual(token, reserve.tokenAddress),
          ),
        )
      : reserves;
  const [
    targetTokens,
    targetReserveData,
    targetConfiguration,
    targetPriceRaw,
    targetCaps,
    targetPaused,
  ] = await Promise.all([
    call<readonly [Address, Address, Address]>(
      input.rpc,
      input.deployment.dataProvider,
      "getReserveTokensAddresses",
      [target.tokenAddress],
      blockTag,
    ),
    call<ReserveData>(
      input.rpc,
      input.deployment.dataProvider,
      "getReserveData",
      [target.tokenAddress],
      blockTag,
    ),
    call<Configuration>(
      input.rpc,
      input.deployment.dataProvider,
      "getReserveConfigurationData",
      [target.tokenAddress],
      blockTag,
    ),
    call<bigint>(
      input.rpc,
      input.deployment.oracle,
      "getAssetPrice",
      [target.tokenAddress],
      blockTag,
    ),
    call<ReserveCaps>(
      input.rpc,
      input.deployment.dataProvider,
      "getReserveCaps",
      [target.tokenAddress],
      blockTag,
    ),
    call<boolean>(
      input.rpc,
      input.deployment.dataProvider,
      "getPaused",
      [target.tokenAddress],
      blockTag,
    ),
  ]);
  const targetBorrowCapRaw =
    targetCaps[0] * BigInt(10) ** targetConfiguration[0];
  const targetDebtRaw = targetReserveData[3] + targetReserveData[4];
  const targetBorrowCapReached =
    targetCaps[0] > ZERO && targetDebtRaw >= targetBorrowCapRaw;
  if (
    !targetConfiguration[6] ||
    !targetConfiguration[8] ||
    targetConfiguration[9] ||
    targetPaused ||
    targetPriceRaw <= ZERO ||
    targetBorrowCapReached
  ) {
    throw new Error(
      `${targetSymbol} borrowing is unavailable on ${input.deployment.protocolLabel}`,
    );
  }

  const availableLiquidityRaw = await call<bigint>(
    input.rpc,
    target.tokenAddress,
    "balanceOf",
    [targetTokens[0]],
    blockTag,
  );
  const reserveRows = await Promise.all(
    candidateReserves.map(async (reserve) => {
      const [
        configuration,
        priceRaw,
        userReserve,
        reserveData,
        reserveCaps,
        paused,
        debtCeiling,
      ] = await Promise.all([
        call<Configuration>(
          input.rpc,
          input.deployment.dataProvider,
          "getReserveConfigurationData",
          [reserve.tokenAddress],
          blockTag,
        ),
        call<bigint>(
          input.rpc,
          input.deployment.oracle,
          "getAssetPrice",
          [reserve.tokenAddress],
          blockTag,
        ),
        input.mode === "existing-position"
          ? call<UserReserve>(
              input.rpc,
              input.deployment.dataProvider,
              "getUserReserveData",
              [reserve.tokenAddress, input.address],
              blockTag,
            )
          : Promise.resolve(null),
        call<ReserveData>(
          input.rpc,
          input.deployment.dataProvider,
          "getReserveData",
          [reserve.tokenAddress],
          blockTag,
        ),
        call<ReserveCaps>(
          input.rpc,
          input.deployment.dataProvider,
          "getReserveCaps",
          [reserve.tokenAddress],
          blockTag,
        ),
        call<boolean>(
          input.rpc,
          input.deployment.dataProvider,
          "getPaused",
          [reserve.tokenAddress],
          blockTag,
        ),
        call<bigint>(
          input.rpc,
          input.deployment.dataProvider,
          "getDebtCeiling",
          [reserve.tokenAddress],
          blockTag,
        ),
      ]);
      const decimals = Number(configuration[0]);
      const priceUsd = Number(priceRaw) / Number(baseCurrencyUnit);
      const walletAsset = [...walletAssets.entries()].find(([token]) =>
        isAddressEqual(token, reserve.tokenAddress),
      )?.[1];
      const walletBalanceRaw =
        input.mode === "existing-position"
          ? (userReserve?.[0] ?? ZERO)
          : BigInt(
              walletAsset?.protocolBalanceRaw ?? walletAsset?.balanceRaw ?? "0",
            );
      const selected =
        input.mode === "existing-position" ||
        Boolean(
          walletAsset && selectedTokens.has(walletAsset.token.toLowerCase()),
        );
      const balanceRaw = selected ? walletBalanceRaw : ZERO;
      const debtRaw =
        input.mode === "existing-position"
          ? (userReserve?.[1] ?? ZERO) + (userReserve?.[2] ?? ZERO)
          : ZERO;
      const isCollateral =
        input.mode === "wallet-estimate"
          ? configuration[5]
          : Boolean(userReserve?.[8]);

      return {
        reserve,
        configuration,
        walletAsset,
        walletBalanceRaw,
        selected,
        balanceRaw,
        debtRaw,
        priceUsd,
        valueUsd: Number(formatUnits(balanceRaw, decimals)) * priceUsd,
        debtUsd: Number(formatUnits(debtRaw, decimals)) * priceUsd,
        isCollateral,
        reserveData,
        reserveCaps,
        paused,
        debtCeiling,
      };
    }),
  );
  const collateral = reserveRows
    .filter((row) => {
      const supplyCapRaw =
        row.reserveCaps[1] * BigInt(10) ** row.configuration[0];
      const capAvailable =
        input.mode === "existing-position" ||
        row.reserveCaps[1] === ZERO ||
        row.reserveData[2] + row.balanceRaw <= supplyCapRaw;
      return (
        row.balanceRaw > ZERO &&
        row.isCollateral &&
        row.configuration[8] &&
        !row.configuration[9] &&
        !row.paused &&
        row.debtCeiling === ZERO &&
        row.configuration[1] > ZERO &&
        row.priceUsd > 0 &&
        capAvailable
      );
    })
    .map((row) => ({
      token: getAddress(row.reserve.tokenAddress) as `0x${string}`,
      symbol: row.reserve.symbol,
      valueUsd: row.valueUsd,
      ltv: Number(row.configuration[1]) / BPS,
      liquidationThreshold: Number(row.configuration[2]) / BPS,
    }));
  const assetEvaluations = input.portfolio.map((asset) => {
    const row = reserveRows.find((candidate) =>
      isAddressEqual(
        candidate.reserve.tokenAddress,
        (asset.protocolAssetToken ?? asset.token) as Address,
      ),
    );
    const selected = selectedTokens.has(asset.token.toLowerCase());
    const selectionStatus = asset.requiredAction
      ? "unselectable"
      : selected
        ? "selected"
        : "not-selected";
    const balanceUsd =
      Number(asset.balance) * Math.max(0, asset.marketPriceUsd ?? 0);
    if (!row) {
      return {
        token: asset.token,
        symbol: asset.symbol,
        ...(balanceUsd > 0 ? { balanceUsd } : {}),
        selectionStatus,
        eligibilityStatus: "unsupported",
        reasonCodes: ["NOT_LISTED"],
        reason: `${asset.symbol} is not listed as collateral in this deployment.`,
        ...(asset.requiredAction
          ? { requiredAction: "Convert to a supported wrapped asset" }
          : {}),
      } satisfies ProtocolAssetEvaluation;
    }
    const protocolReasons = aaveExclusionReasons(row);
    const conversionRequired = Boolean(asset.requiredAction);
    const reasons = [...protocolReasons];
    if (conversionRequired) reasons.unshift("CONVERSION_REQUIRED");
    const eligible = reasons.length === 0;
    const contributesAfterConversion =
      conversionRequired && selected && protocolReasons.length === 0;
    return {
      token: asset.token,
      symbol: asset.symbol,
      ...(balanceUsd > 0 ? { balanceUsd } : {}),
      selectionStatus,
      eligibilityStatus:
        conversionRequired && protocolReasons.length === 0
          ? "supported"
          : eligible
            ? selected
              ? "included"
              : "supported"
            : reasons.some((reason) =>
                  ["FROZEN", "PAUSED", "SUPPLY_CAP_REACHED"].includes(reason),
                )
              ? "temporarily-unavailable"
              : "unsupported",
      reasonCodes: eligible
        ? [selected ? "INCLUDED" : "SUPPORTED_NOT_SELECTED"]
        : reasons,
      reason: contributesAfterConversion
        ? `${asset.symbol} must be wrapped to ${row.reserve.symbol} before supply. Its ${row.reserve.symbol}-equivalent value is included in this estimate.`
        : eligible
          ? selected
            ? "Included in this protocol estimate."
            : "Supported by this protocol, but not selected as collateral."
          : aaveReasonLabel(reasons[0]),
      ltv: Number(row.configuration[1]) / BPS,
      liquidationThreshold: Number(row.configuration[2]) / BPS,
      ...(selected && (eligible || contributesAfterConversion)
        ? { contributionUsd: row.valueUsd }
        : {}),
      ...(asset.requiredAction
        ? {
            requiredAction: `Convert ${asset.symbol} before supplying collateral.`,
          }
        : {}),
    } satisfies ProtocolAssetEvaluation;
  });
  const targetDecimals = Number(targetConfiguration[0]);
  const borrowCapRemainingRaw =
    targetCaps[0] === ZERO
      ? availableLiquidityRaw
      : targetBorrowCapRaw > targetDebtRaw
        ? targetBorrowCapRaw - targetDebtRaw
        : ZERO;
  const borrowableLiquidityRaw =
    availableLiquidityRaw < borrowCapRemainingRaw
      ? availableLiquidityRaw
      : borrowCapRemainingRaw;

  return {
    kind: "aave-like",
    protocolId: input.deployment.protocolId,
    protocolLabel: input.deployment.protocolLabel,
    familyId: input.deployment.familyId,
    familyLabel: input.deployment.familyLabel,
    chainId: input.chainId,
    mode: input.mode,
    targetBorrowAsset: target.symbol,
    rateType: "variable",
    indicativeApr: Number(targetReserveData[6]) / RAY,
    annualRateValue: Number(targetReserveData[6]) / RAY,
    annualRateConvention: "apr",
    rateSourceId: `${input.deployment.protocolId}:variable-borrow-rate`,
    existingDebtUsd: reserveRows.reduce((sum, row) => sum + row.debtUsd, 0),
    availableLiquidityUsd:
      Number(formatUnits(borrowableLiquidityRaw, targetDecimals)) *
      (Number(targetPriceRaw) / Number(baseCurrencyUnit)),
    source: `${input.deployment.protocolLabel} data provider and oracle on-chain reads`,
    sourceType: "on-chain",
    ...(freshnessSeconds === undefined ? {} : { freshnessSeconds }),
    fetchedAt: fetchedAt.toISOString(),
    ...(input.blockTimestamp
      ? {
          observedAt: input.blockTimestamp,
          blockTimestamp: input.blockTimestamp,
        }
      : {}),
    blockNumber: String(BigInt(blockHex)),
    ...(input.now ? { now: input.now } : {}),
    assumptions: [
      `Contract addresses are pinned to the protocol-owned address registry snapshot reviewed on 2026-07-15.`,
      "USD values use the deployment oracle and reserve-native decimals.",
      "Available liquidity is the target underlying balance held by its aToken contract.",
      "Isolation-mode collateral is excluded until Powerrr models debt-ceiling consumption and isolated debt-asset compatibility end to end.",
      "Standard protocol mode is assumed; eMode bonuses are not applied.",
    ],
    warnings: [
      ...(input.mode === "wallet-estimate"
        ? [
            "Wallet-estimate mode models supported wallet assets as newly supplied collateral; it is not a transaction preview.",
          ]
        : []),
      ...(reserveRows.some((row) => row.debtCeiling > ZERO)
        ? ["Isolation-mode collateral was excluded from this estimate."]
        : []),
      ...(reserveRows.some((row) => row.paused)
        ? ["Paused collateral reserves were excluded from this estimate."]
        : []),
    ],
    confidencePenalties: {
      sourcePenalty: 1,
      stalenessPenalty: 0,
      fallbackPenalty: 0,
      complexityPenalty: 4,
      liquidityPenalty: 0,
    },
    safetyProfile: input.safetyProfile,
    targetHealthFactor: input.deployment.targetHealthFactor,
    assetEvaluations,
    collateral,
  };
}

function aaveExclusionReasons(row: {
  configuration: Configuration;
  reserveData: ReserveData;
  reserveCaps: ReserveCaps;
  walletBalanceRaw: bigint;
  paused: boolean;
  debtCeiling: bigint;
  priceUsd: number;
}): ProtocolAssetEvaluation["reasonCodes"] {
  const reasons: ProtocolAssetEvaluation["reasonCodes"] = [];
  if (!row.configuration[5]) reasons.push("COLLATERAL_DISABLED");
  if (!row.configuration[8]) reasons.push("INACTIVE");
  if (row.configuration[9]) reasons.push("FROZEN");
  if (row.paused) reasons.push("PAUSED");
  if (row.debtCeiling > ZERO) reasons.push("ISOLATION_MODE_UNMODELED");
  if (row.configuration[1] <= ZERO) reasons.push("ZERO_LTV");
  if (row.priceUsd <= 0) reasons.push("PRICE_UNAVAILABLE");
  const supplyCapRaw = row.reserveCaps[1] * BigInt(10) ** row.configuration[0];
  if (
    row.reserveCaps[1] > ZERO &&
    row.reserveData[2] + row.walletBalanceRaw > supplyCapRaw
  ) {
    reasons.push("SUPPLY_CAP_REACHED");
  }
  return reasons;
}

function aaveReasonLabel(
  reason: ProtocolAssetEvaluation["reasonCodes"][number] | undefined,
): string {
  const labels: Partial<
    Record<ProtocolAssetEvaluation["reasonCodes"][number], string>
  > = {
    COLLATERAL_DISABLED: "This reserve is not enabled as collateral.",
    INACTIVE: "This reserve is inactive.",
    FROZEN: "This reserve is currently frozen.",
    PAUSED: "This reserve is currently paused.",
    ISOLATION_MODE_UNMODELED:
      "Isolation-mode collateral is not included in this estimate.",
    ZERO_LTV: "This reserve currently has a zero borrowing LTV.",
    SUPPLY_CAP_REACHED: "Supplying this balance would exceed the reserve cap.",
    PRICE_UNAVAILABLE: "The protocol oracle did not return a usable price.",
    CONVERSION_REQUIRED:
      "This asset must be converted before it can be supplied.",
  };
  return (
    labels[reason ?? "MARKET_STATE_UNAVAILABLE"] ??
    "This asset is not available as collateral."
  );
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

async function call<TResult>(
  rpc: CompoundLiveRpcClient,
  to: Address,
  functionName: string,
  args: unknown[],
  blockTag: string,
): Promise<TResult> {
  const data = encodeFunctionData({ abi, functionName, args } as never);
  const result = await rpc.request<Hex>({
    method: "eth_call",
    params: [{ to, data }, blockTag],
  });
  return decodeFunctionResult({
    abi,
    functionName,
    data: result,
  } as never) as TResult;
}

function normalizeReserveTokens(value: unknown): ReserveToken[] {
  if (!Array.isArray(value)) {
    throw new Error("Protocol data provider returned an invalid reserve list");
  }

  return value.map((item) => {
    if (
      Array.isArray(item) &&
      typeof item[0] === "string" &&
      typeof item[1] === "string"
    ) {
      return { symbol: item[0], tokenAddress: getAddress(item[1]) };
    }
    if (
      typeof item === "object" &&
      item !== null &&
      "symbol" in item &&
      "tokenAddress" in item
    ) {
      const record = item as { symbol: unknown; tokenAddress: unknown };
      if (
        typeof record.symbol === "string" &&
        typeof record.tokenAddress === "string"
      ) {
        return {
          symbol: record.symbol,
          tokenAddress: getAddress(record.tokenAddress),
        };
      }
    }
    throw new Error("Protocol data provider returned an invalid reserve token");
  });
}
