import type { PortfolioAsset } from "@powerrr/shared-types";
import { describe, expect, it } from "vitest";
import {
  decodeFunctionData,
  encodeFunctionResult,
  parseAbi,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import {
  COMPOUND_USDC_COMET_MAINNET,
  loadCompoundUsdcCometSnapshot,
  type CompoundLiveRpcClient,
} from "./compound-live-source.js";
import {
  projectLiveSnapshots,
  quoteCompoundLiveSnapshot,
  quoteLiveSnapshots,
} from "./live-snapshots.js";

const cometAbi = parseAbi([
  "function numAssets() view returns (uint8)",
  "function getAssetInfo(uint8 i) view returns ((uint8 offset,address asset,address priceFeed,uint64 scale,uint64 borrowCollateralFactor,uint64 liquidateCollateralFactor,uint64 liquidationFactor,uint128 supplyCap))",
  "function collateralBalanceOf(address account, address asset) view returns (uint128)",
  "function borrowBalanceOf(address account) view returns (uint256)",
  "function getPrice(address priceFeed) view returns (uint256)",
  "function totalsCollateral(address asset) view returns (uint128 totalSupplyAsset,uint128 _reserved)",
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
]);

const account = "0x1111111111111111111111111111111111111111" as const;
const usdc = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as const;
const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as const;
const wbtc = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" as const;
const wethPriceFeed = "0x00000000000000000000000000000000000000A1" as const;
const wbtcPriceFeed = "0x00000000000000000000000000000000000000B1" as const;
const utilization = 250_000_000_000_000_000n;

function buildPortfolioAsset(
  symbol: "WETH" | "WBTC",
  balance: number,
): PortfolioAsset {
  const token = symbol === "WETH" ? weth : wbtc;
  const decimals = symbol === "WETH" ? 18 : 8;
  return {
    chainId: 1,
    token,
    symbol,
    name: symbol === "WETH" ? "Wrapped Ether" : "Wrapped Bitcoin",
    decimals,
    balance: String(balance),
    balanceRaw: parseUnits(String(balance), decimals).toString(),
    protocolEligible: { "compound-iii": true },
  };
}

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
      expect.objectContaining({
        token: weth,
        symbol: "WETH",
        valueUsd: 7_000,
        borrowCollateralFactor: 0.825,
        liquidateCollateralFactor: 0.895,
      }),
      expect.objectContaining({
        token: wbtc,
        symbol: "WBTC",
        valueUsd: 32_500,
        borrowCollateralFactor: 0.7,
        liquidateCollateralFactor: 0.77,
      }),
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

  it("aggregates native ETH and WETH into one WETH collateral balance", async () => {
    const eth = "0xEeeeeEeeeEeEeeEeEeeEEEeeeeEeeeeeeeEEeE" as const;
    const snapshot = await loadCompoundUsdcCometSnapshot({
      rpc: createCompoundRpcMock({
        mode: "wallet-estimate",
        borrowBalanceRaw: 0n,
        collateralBalances: {},
      }),
      address: account,
      chainId: 1,
      mode: "wallet-estimate",
      portfolio: [
        {
          chainId: 1,
          token: eth,
          symbol: "ETH",
          name: "Ether",
          decimals: 18,
          balance: "1",
          balanceRaw: parseUnits("1", 18).toString(),
          protocolAssetToken: weth,
          protocolBalanceRaw: parseUnits("1", 18).toString(),
          requiredAction: "wrap",
          marketPriceUsd: 3_500,
          protocolEligible: { "compound-iii": true },
        },
        buildPortfolioAsset("WETH", 2),
      ],
      selectedCollateralTokens: [eth, weth],
      targetBorrowAssets: ["USDC"],
      safetyProfile: "balanced",
    });

    expect(snapshot.collateral).toEqual([
      expect.objectContaining({ symbol: "WETH", valueUsd: 10_500 }),
    ]);
    const projected = projectLiveSnapshots([snapshot], [eth, weth])[0]!;
    expect(projected.assetEvaluations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          symbol: "ETH",
          eligibilityStatus: "supported",
          contributionUsd: 3_500,
          reasonCodes: ["CONVERSION_REQUIRED"],
        }),
        expect.objectContaining({
          symbol: "WETH",
          contributionUsd: 7_000,
          reasonCodes: ["INCLUDED"],
        }),
      ]),
    );
  });

  it("does not treat Comet's native USDC base token as collateral", async () => {
    const snapshot = await loadCompoundUsdcCometSnapshot({
      rpc: createCompoundRpcMock({
        mode: "wallet-estimate",
        borrowBalanceRaw: 0n,
        collateralBalances: {},
      }),
      address: account,
      chainId: 1,
      mode: "wallet-estimate",
      portfolio: [
        {
          chainId: 1,
          token: usdc,
          symbol: "USDC",
          name: "USD Coin",
          decimals: 6,
          balance: "37.192124",
          balanceRaw: "37192124",
          protocolEligible: { "compound-iii": false },
        },
      ],
      selectedCollateralTokens: [usdc],
      targetBorrowAssets: ["USDC"],
      safetyProfile: "balanced",
    });
    const quote = quoteLiveSnapshots({
      snapshots: projectLiveSnapshots([snapshot], [usdc]),
    })[0]!;

    expect(quote.exactMaximum.raw).toBe("0");
    expect(quote.collateralUsed).toEqual([]);
    expect(quote.assetEvaluations).toContainEqual(
      expect.objectContaining({
        symbol: "USDC",
        reasonCodes: ["NOT_LISTED"],
      }),
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

  it("uses totalsCollateral rather than token donations for remaining supply capacity", async () => {
    const rpc = createCompoundRpcMock({
      mode: "wallet-estimate",
      borrowBalanceRaw: 0n,
      collateralBalances: {},
      wethSupplyCapRaw: parseUnits("100", 18),
      wethTotalSupplyAssetRaw: parseUnits("90", 18),
    });
    const snapshot = await loadCompoundUsdcCometSnapshot({
      rpc,
      address: account,
      chainId: 1,
      mode: "wallet-estimate",
      portfolio: [buildPortfolioAsset("WETH", 20)],
      targetBorrowAssets: ["USDC"],
      safetyProfile: "max",
    });

    expect(
      rpc.calls.some((call) => call.functionName === "totalsCollateral"),
    ).toBe(true);
    expect(snapshot.rawCollateral[0]?.remainingSupplyRaw).toBe(
      parseUnits("10", 18).toString(),
    );
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
  wethSupplyCapRaw?: bigint;
  wethTotalSupplyAssetRaw?: bigint;
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

      if (call.to.toLowerCase() === usdc.toLowerCase()) {
        calls.push({
          functionName: "balanceOf",
          args: [COMPOUND_USDC_COMET_MAINNET],
          blockTag: String(blockTag),
        });
        return encodeFunctionResult({
          abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
          functionName: "balanceOf",
          result: 750_000_000_000n,
        }) as TResult;
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
    wethSupplyCapRaw?: bigint;
    wethTotalSupplyAssetRaw?: bigint;
  },
): Hex {
  if (functionName === "numAssets") {
    return encode(functionName, 2);
  }

  if (functionName === "baseScale") {
    return encode(functionName, 1_000_000n);
  }

  if (functionName === "baseToken") {
    return encode(functionName, usdc);
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
    return encode(functionName, assetInfo(Number(args[0]), input));
  }

  if (functionName === "totalsCollateral") {
    return encode(functionName, [input.wethTotalSupplyAssetRaw ?? 0n, 0n]);
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

function assetInfo(index: number, input: { wethSupplyCapRaw?: bigint }) {
  if (index === 0) {
    return {
      offset: 0,
      asset: weth,
      priceFeed: wethPriceFeed,
      scale: 1_000_000_000_000_000_000n,
      borrowCollateralFactor: 825_000_000_000_000_000n,
      liquidateCollateralFactor: 895_000_000_000_000_000n,
      liquidationFactor: 950_000_000_000_000_000n,
      supplyCap: input.wethSupplyCapRaw ?? 0n,
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
