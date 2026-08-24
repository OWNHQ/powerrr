import { describe, expect, it } from "vitest";
import {
  decodeFunctionData,
  encodeFunctionResult,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import {
  AAVE_V3_ETHEREUM,
  loadAaveLikeSnapshot,
} from "./aave-like-live-source.js";
import type { CompoundLiveRpcClient } from "./compound-live-source.js";
import { projectLiveSnapshots, quoteLiveSnapshots } from "./live-snapshots.js";

const abi = parseAbi([
  "function getAllReservesTokens() view returns ((string symbol,address tokenAddress)[])",
  "function getReserveConfigurationData(address asset) view returns (uint256 decimals,uint256 ltv,uint256 liquidationThreshold,uint256 liquidationBonus,uint256 reserveFactor,bool usageAsCollateralEnabled,bool borrowingEnabled,bool stableBorrowRateEnabled,bool isActive,bool isFrozen)",
  "function getReserveTokensAddresses(address asset) view returns (address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress)",
  "function getReserveData(address asset) view returns (uint256 unbacked,uint256 accruedToTreasuryScaled,uint256 totalAToken,uint256 totalStableDebt,uint256 totalVariableDebt,uint256 liquidityRate,uint256 variableBorrowRate,uint256 stableBorrowRate,uint256 averageStableBorrowRate,uint256 liquidityIndex,uint256 variableBorrowIndex,uint40 lastUpdateTimestamp)",
  "function getReserveCaps(address asset) view returns (uint256 borrowCap,uint256 supplyCap)",
  "function getPaused(address asset) view returns (bool)",
  "function getDebtCeiling(address asset) view returns (uint256)",
  "function getAssetPrice(address asset) view returns (uint256)",
  "function BASE_CURRENCY_UNIT() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
]);

const account = "0x1111111111111111111111111111111111111111" as const;
const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as const;
const usdc = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as const;
const aUsdc = "0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c" as const;
const zero = "0x0000000000000000000000000000000000000000" as const;

describe("Aave-like live source", () => {
  it("builds wallet capacity only from on-chain configuration, oracle, and liquidity reads", async () => {
    const rpc = createRpcMock();
    const snapshot = await loadAaveLikeSnapshot({
      address: account,
      chainId: 1,
      mode: "wallet-estimate",
      safetyProfile: "balanced",
      targetBorrowAssets: ["USDC"],
      portfolio: [
        {
          chainId: 1,
          token: weth,
          symbol: "WETH",
          name: "Wrapped Ether",
          decimals: 18,
          balance: "2",
          balanceRaw: "2000000000000000000",
          protocolEligible: { "aave-v3": true },
        },
      ],
      now: new Date("2026-07-15T12:00:00.000Z"),
      rpc,
      deployment: AAVE_V3_ETHEREUM,
    });

    expect(snapshot).toMatchObject({
      protocolId: "aave-v3",
      targetBorrowAsset: "USDC",
      existingDebtUsd: 0,
      availableLiquidityUsd: 1_000_000,
      indicativeApr: 0.05,
      sourceType: "on-chain",
      blockNumber: "23123696",
    });
    expect(snapshot.collateral).toEqual([
      expect.objectContaining({
        symbol: "WETH",
        valueUsd: 6_000,
        ltv: 0.8,
        liquidationThreshold: 0.83,
      }),
    ]);
    expect(new Set(rpc.blockTags)).toEqual(new Set(["0x160d6f0"]));
  });

  it("shows native ETH's WETH-equivalent contribution and required wrap", async () => {
    const snapshot = await loadAaveLikeSnapshot({
      address: account,
      chainId: 1,
      mode: "wallet-estimate",
      safetyProfile: "balanced",
      targetBorrowAssets: ["USDC"],
      selectedCollateralTokens: ["0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"],
      portfolio: [
        {
          chainId: 1,
          token: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
          symbol: "ETH",
          name: "Ether",
          decimals: 18,
          balance: "2",
          balanceRaw: "2000000000000000000",
          protocolAssetToken: weth,
          protocolBalanceRaw: "2000000000000000000",
          requiredAction: "wrap",
          marketPriceUsd: 3_000,
          protocolEligible: { "aave-v3": true },
        },
      ],
      rpc: createRpcMock(),
      deployment: AAVE_V3_ETHEREUM,
    });

    expect(snapshot.collateral).toEqual([
      expect.objectContaining({ symbol: "WETH", valueUsd: 6_000 }),
    ]);
    const projected = projectLiveSnapshots(
      [snapshot],
      ["0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"],
    )[0]!;
    expect(projected.assetEvaluations).toContainEqual(
      expect.objectContaining({
        symbol: "ETH",
        selectionStatus: "unselectable",
        eligibilityStatus: "supported",
        reasonCodes: ["CONVERSION_REQUIRED"],
        contributionUsd: 6_000,
        requiredAction: "Convert ETH before supplying collateral.",
      }),
    );
  });

  it("aggregates ETH and WETH once while preserving each contribution", async () => {
    const eth = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as const;
    const snapshot = await loadAaveLikeSnapshot({
      address: account,
      chainId: 1,
      mode: "wallet-estimate",
      safetyProfile: "balanced",
      targetBorrowAssets: ["USDC"],
      selectedCollateralTokens: [eth, weth],
      portfolio: [
        {
          chainId: 1,
          token: eth,
          symbol: "ETH",
          name: "Ether",
          decimals: 18,
          balance: "4",
          balanceRaw: "4000000000000000000",
          protocolAssetToken: weth,
          protocolBalanceRaw: "4000000000000000000",
          requiredAction: "wrap",
          marketPriceUsd: 3_000,
          protocolEligible: { "aave-v3": true },
        },
        {
          chainId: 1,
          token: weth,
          symbol: "WETH",
          name: "Wrapped Ether",
          decimals: 18,
          balance: "1",
          balanceRaw: "1000000000000000000",
          marketPriceUsd: 3_000,
          protocolEligible: { "aave-v3": true },
        },
      ],
      rpc: createRpcMock(),
      deployment: AAVE_V3_ETHEREUM,
    });

    expect(snapshot.collateral).toEqual([
      expect.objectContaining({ symbol: "WETH", valueUsd: 15_000 }),
    ]);
    const projected = projectLiveSnapshots([snapshot], [eth, weth])[0]!;
    expect(projected.assetEvaluations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          symbol: "ETH",
          contributionUsd: 12_000,
          reasonCodes: ["CONVERSION_REQUIRED"],
        }),
        expect.objectContaining({
          symbol: "WETH",
          contributionUsd: 3_000,
          reasonCodes: ["INCLUDED"],
        }),
      ]),
    );
  });

  it("limits borrowable liquidity to the remaining target reserve cap", async () => {
    const snapshot = await loadAaveLikeSnapshot({
      address: account,
      chainId: 1,
      mode: "wallet-estimate",
      safetyProfile: "balanced",
      targetBorrowAssets: ["USDC"],
      portfolio: [
        {
          chainId: 1,
          token: weth,
          symbol: "WETH",
          name: "Wrapped Ether",
          decimals: 18,
          balance: "2",
          balanceRaw: "2000000000000000000",
          protocolEligible: { "aave-v3": true },
        },
      ],
      rpc: createRpcMock({
        targetBorrowCap: 500_000n,
        targetDebtRaw: 499_000_000_000n,
      }),
      deployment: AAVE_V3_ETHEREUM,
    });

    expect(snapshot.availableLiquidityUsd).toBe(1_000);
  });

  it("calculates native USDC collateral capacity from exact oracle value and live LTV", async () => {
    const balanceRaw = 37_192_124n;
    const priceRaw = 99_984_664n;
    const snapshot = await loadAaveLikeSnapshot({
      address: account,
      chainId: 1,
      mode: "wallet-estimate",
      safetyProfile: "balanced",
      targetBorrowAssets: ["USDC"],
      selectedCollateralTokens: [usdc],
      portfolio: [
        {
          chainId: 1,
          token: usdc,
          symbol: "USDC",
          name: "USD Coin",
          decimals: 6,
          balance: "37.192124",
          balanceRaw: balanceRaw.toString(),
          protocolEligible: { "aave-v3": true },
        },
      ],
      rpc: createRpcMock({
        usdcCollateralEnabled: true,
        usdcLtv: 7_500n,
        usdcLiquidationThreshold: 7_800n,
        usdcPriceRaw: priceRaw,
      }),
      deployment: AAVE_V3_ETHEREUM,
    });
    const quote = quoteLiveSnapshots({
      snapshots: projectLiveSnapshots([snapshot], [usdc]),
    })[0]!;
    const oracleValueRaw = (balanceRaw * priceRaw) / 100_000_000n;
    const expectedMaximumRaw = (oracleValueRaw * 7_500n) / 10_000n;

    expect(quote.exactMaximum).toEqual({
      raw: expectedMaximumRaw.toString(),
      decimals: 6,
    });
    expect(quote.collateralUsed[0]).toMatchObject({
      symbol: "USDC",
      ltv: 0.75,
      liquidationThreshold: 0.78,
    });
    expect(quote.assetEvaluations).toContainEqual(
      expect.objectContaining({
        symbol: "USDC",
        reasonCodes: ["INCLUDED"],
      }),
    );
  });

  it("excludes isolation-mode collateral until its transaction constraints are modeled", async () => {
    const snapshot = await loadAaveLikeSnapshot({
      address: account,
      chainId: 1,
      mode: "wallet-estimate",
      safetyProfile: "balanced",
      targetBorrowAssets: ["USDC"],
      portfolio: [
        {
          chainId: 1,
          token: weth,
          symbol: "WETH",
          name: "Wrapped Ether",
          decimals: 18,
          balance: "2",
          balanceRaw: "2000000000000000000",
          protocolEligible: { "aave-v3": true },
        },
      ],
      rpc: createRpcMock({ isolatedWeth: true }),
      deployment: AAVE_V3_ETHEREUM,
    });

    expect(snapshot.collateral).toEqual([]);
    expect((snapshot.warnings ?? []).join(" ")).toContain("Isolation-mode");
  });
});

function createRpcMock(
  input: {
    isolatedWeth?: boolean;
    targetBorrowCap?: bigint;
    targetDebtRaw?: bigint;
    usdcCollateralEnabled?: boolean;
    usdcLtv?: bigint;
    usdcLiquidationThreshold?: bigint;
    usdcPriceRaw?: bigint;
  } = {},
): CompoundLiveRpcClient & { blockTags: string[] } {
  const blockTags: string[] = [];
  return {
    blockTags,
    async request<TResult>(request: {
      method: string;
      params?: unknown[];
    }): Promise<TResult> {
      if (request.method === "eth_blockNumber") return "0x160d6f0" as TResult;
      blockTags.push(String(request.params?.[1]));
      const call = (request.params?.[0] ?? {}) as { to?: Address; data?: Hex };
      if (!call.to || !call.data) throw new Error("Invalid eth_call");
      const decoded = decodeFunctionData({ abi, data: call.data });

      if (decoded.functionName === "getAllReservesTokens") {
        return result("getAllReservesTokens", [
          [
            { symbol: "WETH", tokenAddress: weth },
            { symbol: "USDC", tokenAddress: usdc },
          ],
        ]) as TResult;
      }
      if (decoded.functionName === "BASE_CURRENCY_UNIT")
        return result("BASE_CURRENCY_UNIT", [100_000_000n]) as TResult;
      if (decoded.functionName === "getReserveConfigurationData") {
        const asset = (decoded.args?.[0] as string).toLowerCase();
        return result(
          "getReserveConfigurationData",
          asset === usdc.toLowerCase()
            ? [
                6n,
                input.usdcLtv ?? 0n,
                input.usdcLiquidationThreshold ?? 0n,
                0n,
                1000n,
                input.usdcCollateralEnabled ?? false,
                true,
                false,
                true,
                false,
              ]
            : [
                18n,
                8000n,
                8300n,
                10500n,
                1000n,
                true,
                true,
                false,
                true,
                false,
              ],
        ) as TResult;
      }
      if (decoded.functionName === "getReserveTokensAddresses") {
        return result("getReserveTokensAddresses", [
          aUsdc,
          zero,
          zero,
        ]) as TResult;
      }
      if (decoded.functionName === "getReserveData") {
        const asset = (decoded.args?.[0] as string).toLowerCase();
        return result("getReserveData", [
          0n,
          0n,
          0n,
          asset === usdc.toLowerCase() ? (input.targetDebtRaw ?? 0n) : 0n,
          0n,
          0n,
          50_000_000_000_000_000_000_000_000n,
          0n,
          0n,
          0n,
          0n,
          0,
        ]) as TResult;
      }
      if (decoded.functionName === "getReserveCaps") {
        const asset = (decoded.args?.[0] as string).toLowerCase();
        return result("getReserveCaps", [
          asset === usdc.toLowerCase() ? (input.targetBorrowCap ?? 0n) : 0n,
          0n,
        ]) as TResult;
      }
      if (decoded.functionName === "getPaused") {
        return result("getPaused", [false]) as TResult;
      }
      if (decoded.functionName === "getDebtCeiling") {
        const asset = (decoded.args?.[0] as string).toLowerCase();
        return result("getDebtCeiling", [
          input.isolatedWeth && asset === weth.toLowerCase() ? 1n : 0n,
        ]) as TResult;
      }
      if (decoded.functionName === "getAssetPrice") {
        const asset = (decoded.args?.[0] as string).toLowerCase();
        return result("getAssetPrice", [
          asset === usdc.toLowerCase()
            ? (input.usdcPriceRaw ?? 100_000_000n)
            : 300_000_000_000n,
        ]) as TResult;
      }
      if (decoded.functionName === "balanceOf")
        return result("balanceOf", [1_000_000_000_000n]) as TResult;
      throw new Error("Unexpected function");
    },
  };
}

function result(functionName: string, values: readonly unknown[]): Hex {
  return encodeFunctionResult({
    abi,
    functionName,
    result: values.length === 1 ? values[0] : values,
  } as never);
}
