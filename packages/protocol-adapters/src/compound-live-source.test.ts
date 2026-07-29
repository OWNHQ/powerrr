import { buildPortfolioAsset } from "@powerrr/fixtures";
import { describe, expect, it } from "vitest";
import {
  decodeFunctionData,
  encodeFunctionResult,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import {
  COMPOUND_USDC_COMET_MAINNET,
  loadCompoundUsdcCometSnapshot,
  type CompoundLiveRpcClient,
} from "./compound-live-source.js";
import { quoteCompoundLiveSnapshot } from "./live-snapshots.js";

const cometAbi = parseAbi([
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

const account = "0x1111111111111111111111111111111111111111" as const;
const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as const;
const wbtc = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" as const;
const wethPriceFeed = "0x00000000000000000000000000000000000000A1" as const;
const wbtcPriceFeed = "0x00000000000000000000000000000000000000B1" as const;
const utilization = 250_000_000_000_000_000n;

describe("Compound III live Comet snapshot source", () => {
  it("builds a wallet-estimate snapshot from Comet factors, prices, and wallet balances", async () => {
    const rpc = createCompoundRpcMock({
      mode: "wallet-estimate",
      borrowBalanceRaw: 0n,
      collateralBalances: {},
    });

    const snapshot = await loadCompoundUsdcCometSnapshot({
      rpc,
      address: account,
      chainId: 1,
      mode: "wallet-estimate",
      portfolio: [
        buildPortfolioAsset("WETH", 2),
        buildPortfolioAsset("WBTC", 0.5),
      ],
      targetBorrowAssets: ["USDC"],
      safetyProfile: "balanced",
      now: new Date("2026-07-01T12:00:00.000Z"),
    });

    expect(snapshot).toMatchObject({
      kind: "compound",
      protocolId: "compound-iii",
      blockNumber: "23123696",
      existingDebtUsd: 0,
      availableLiquidityUsd: 750_000,
    });
    expect(snapshot.indicativeApr).toBeCloseTo(0.05);
    expect(snapshot.collateral).toEqual([
      {
        token: weth,
        symbol: "WETH",
        valueUsd: 7_000,
        borrowCollateralFactor: 0.825,
        liquidateCollateralFactor: 0.895,
      },
      {
        token: wbtc,
        symbol: "WBTC",
        valueUsd: 32_500,
        borrowCollateralFactor: 0.7,
        liquidateCollateralFactor: 0.77,
      },
    ]);
    expect(rpc.calls.some((call) => call.functionName === "getAssetInfo")).toBe(
      true,
    );
    expect(rpc.calls.some((call) => call.functionName === "getPrice")).toBe(
      true,
    );
    expect(snapshot.minimumBorrowUsd).toBe(100);
    expect(
      rpc.calls.some((call) => call.functionName === "borrowBalanceOf"),
    ).toBe(false);
    expect(new Set(rpc.calls.map((call) => call.blockTag))).toEqual(
      new Set(["0x160d6f0"]),
    );
  });

  it("builds an existing-position snapshot from supplied Comet collateral and borrow balance", async () => {
    const rpc = createCompoundRpcMock({
      mode: "existing-position",
      borrowBalanceRaw: 12_500_000_000n,
      collateralBalances: {
        [weth.toLowerCase()]: 3_000_000_000_000_000_000n,
        [wbtc.toLowerCase()]: 0n,
      },
    });

    const snapshot = await loadCompoundUsdcCometSnapshot({
      rpc,
      address: account,
      chainId: 1,
      mode: "existing-position",
      portfolio: [],
      targetBorrowAssets: ["USDC"],
      safetyProfile: "balanced",
      now: new Date("2026-07-01T12:00:00.000Z"),
    });
    const quote = quoteCompoundLiveSnapshot(snapshot);

    expect(snapshot.existingDebtUsd).toBe(12_500);
    expect(snapshot.collateral).toHaveLength(1);
    expect(snapshot.collateral[0]).toMatchObject({
      symbol: "WETH",
      valueUsd: 10_500,
    });
    expect(quote.safeBorrowUsd).toBe(0);
    expect(quote.healthFactor).toBe(0.7518);
  });

  it("fails closed when Compound borrowing operations are paused", async () => {
    const rpc = createCompoundRpcMock({
      mode: "wallet-estimate",
      borrowBalanceRaw: 0n,
      collateralBalances: {},
      withdrawPaused: true,
    });

    await expect(
      loadCompoundUsdcCometSnapshot({
        rpc,
        address: account,
        chainId: 1,
        mode: "wallet-estimate",
        portfolio: [buildPortfolioAsset("WETH", 2)],
        targetBorrowAssets: ["USDC"],
        safetyProfile: "balanced",
      }),
    ).rejects.toThrow("operations are paused");
  });
});

function createCompoundRpcMock(input: {
  mode: "wallet-estimate" | "existing-position";
  borrowBalanceRaw: bigint;
  collateralBalances: Record<string, bigint>;
  baseBorrowMinRaw?: bigint;
  supplyPaused?: boolean;
  withdrawPaused?: boolean;
}): CompoundLiveRpcClient & {
  calls: Array<{
    functionName: string;
    args: readonly unknown[];
    blockTag: string;
  }>;
} {
  const calls: Array<{
    functionName: string;
    args: readonly unknown[];
    blockTag: string;
  }> = [];

  return {
    calls,
    async request<TResult>(request: {
      method: string;
      params?: unknown[];
    }): Promise<TResult> {
      if (request.method === "eth_blockNumber") {
        return "0x160d6f0" as TResult;
      }

      if (request.method !== "eth_call") {
        throw new Error(`Unexpected RPC method ${request.method}`);
      }

      const [call, blockTag] = request.params ?? [];
      if (!isEthCall(call)) {
        throw new Error("Expected eth_call params");
      }

      expect(call.to).toBe(COMPOUND_USDC_COMET_MAINNET);
      const decoded = decodeFunctionData({
        abi: cometAbi,
        data: call.data,
      } as never);
      calls.push({
        functionName: decoded.functionName,
        args: decoded.args ?? [],
        blockTag: String(blockTag),
      });

      return resultFor(
        decoded.functionName,
        decoded.args ?? [],
        input,
      ) as TResult;
    },
  };
}

function resultFor(
  functionName: string,
  args: readonly unknown[],
  input: {
    mode: "wallet-estimate" | "existing-position";
    borrowBalanceRaw: bigint;
    collateralBalances: Record<string, bigint>;
    baseBorrowMinRaw?: bigint;
    supplyPaused?: boolean;
    withdrawPaused?: boolean;
  },
): Hex {
  if (functionName === "numAssets") {
    return encode(functionName, 2);
  }

  if (functionName === "baseScale") {
    return encode(functionName, 1_000_000n);
  }

  if (functionName === "priceScale") {
    return encode(functionName, 100_000_000n);
  }

  if (functionName === "baseBorrowMin") {
    return encode(functionName, input.baseBorrowMinRaw ?? 100_000_000n);
  }

  if (functionName === "isSupplyPaused") {
    return encode(functionName, input.supplyPaused ?? false);
  }

  if (functionName === "isWithdrawPaused") {
    return encode(functionName, input.withdrawPaused ?? false);
  }

  if (functionName === "totalSupply") {
    return encode(functionName, 1_000_000_000_000n);
  }

  if (functionName === "totalBorrow") {
    return encode(functionName, 250_000_000_000n);
  }

  if (functionName === "getUtilization") {
    return encode(functionName, utilization);
  }

  if (functionName === "getBorrowRate") {
    return encode(functionName, 1_585_489_599n);
  }

  if (functionName === "borrowBalanceOf") {
    return encode(functionName, input.borrowBalanceRaw);
  }

  if (functionName === "getAssetInfo") {
    return encode(functionName, assetInfo(Number(args[0])));
  }

  if (functionName === "getPrice") {
    return encode(
      functionName,
      args[0] === wethPriceFeed ? 350_000_000_000n : 6_500_000_000_000n,
    );
  }

  if (functionName === "collateralBalanceOf") {
    const asset = String(args[1]).toLowerCase();

    return encode(functionName, input.collateralBalances[asset] ?? 0n);
  }

  throw new Error(`Unexpected function ${functionName}`);
}

function assetInfo(index: number) {
  if (index === 0) {
    return {
      offset: 0,
      asset: weth,
      priceFeed: wethPriceFeed,
      scale: 1_000_000_000_000_000_000n,
      borrowCollateralFactor: 825_000_000_000_000_000n,
      liquidateCollateralFactor: 895_000_000_000_000_000n,
      liquidationFactor: 950_000_000_000_000_000n,
      supplyCap: 0n,
    };
  }

  return {
    offset: 1,
    asset: wbtc,
    priceFeed: wbtcPriceFeed,
    scale: 100_000_000n,
    borrowCollateralFactor: 700_000_000_000_000_000n,
    liquidateCollateralFactor: 770_000_000_000_000_000n,
    liquidationFactor: 950_000_000_000_000_000n,
    supplyCap: 0n,
  };
}

function encode(functionName: string, result: unknown): Hex {
  return encodeFunctionResult({
    abi: cometAbi,
    functionName,
    result,
  } as never);
}

function isEthCall(value: unknown): value is { to: Address; data: Hex } {
  return (
    typeof value === "object" &&
    value !== null &&
    "to" in value &&
    "data" in value
  );
}
