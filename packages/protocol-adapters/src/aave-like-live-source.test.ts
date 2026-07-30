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
    expect(snapshot.assetEvaluations).toContainEqual(
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
    expect(snapshot.assetEvaluations).toEqual(
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
            ? [6n, 0n, 0n, 0n, 1000n, false, true, false, true, false]
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
          asset === usdc.toLowerCase() ? 100_000_000n : 300_000_000_000n,
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
