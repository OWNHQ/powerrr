import { createLiveSourceClients } from "@powerrr/clients";
import { createPowerrrEngine, PowerrrEngineError } from "@powerrr/engine-sdk";
import {
  COMPOUND_USDC_COMET_MAINNET,
  type CompoundLiveRpcClient,
} from "@powerrr/protocol-adapters";
import { describe, expect, it } from "vitest";
import {
  decodeFunctionData,
  encodeFunctionResult,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import {
  createNuxtLiveEngineDependencies,
  normalizeLiveEnsName,
  resolveLiveAddress,
} from "./live-engine-dependencies.js";

const account = "0x1111111111111111111111111111111111111111" as const;
const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as const;
const wbtc = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" as const;
const wethPriceFeed = "0x00000000000000000000000000000000000000A1" as const;
const wbtcPriceFeed = "0x00000000000000000000000000000000000000B1" as const;
const utilization = 250_000_000_000_000_000n;

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
]);
const erc20Abi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
]);
const oracleAbi = parseAbi([
  "function BASE_CURRENCY_UNIT() view returns (uint256)",
  "function getAssetPrice(address asset) view returns (uint256)",
]);
const aaveOracle = "0x54586bE62E3c3580375aE3723C145253060Ca0C2";
const steth = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";
const wsteth = "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0";
const universalResolver = "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe";
const resolver = "0x00000000000000000000000000000000000000e1";
const universalResolverAbi = parseAbi([
  "function resolveWithGateways(bytes name, bytes data, string[] gateways) view returns (bytes result,address resolver)",
]);
const ensAddressAbi = parseAbi([
  "function addr(bytes32 node) view returns (address)",
]);
const wstethAbi = parseAbi([
  "function getWstETHByStETH(uint256 stETHAmount) view returns (uint256)",
]);

describe("Nuxt live engine dependencies", () => {
  it("normalizes ENSIP-15 names and resolves through the Universal Resolver", async () => {
    expect(normalizeLiveEnsName("  Vojtch.ETH ")).toBe("vojtch.eth");
    expect(() => normalizeLiveEnsName("invalid name.eth")).toThrow();

    const calls: string[] = [];
    const resolved = await resolveLiveAddress(
      {
        chainId: 1,
        input: { ensName: "Vojtch.ETH" },
      },
      {
        async request<TResult>(request: {
          method: string;
          params?: unknown[];
        }) {
          if (request.method === "eth_blockNumber")
            return "0x160d6f0" as TResult;
          if (request.method === "eth_getBlockByNumber") {
            return { timestamp: "0x6877c680" } as TResult;
          }
          if (request.method !== "eth_call")
            throw new Error(`Unexpected ${request.method}`);
          const call = request.params?.[0] as { to: string; data: Hex };
          calls.push(call.to);
          const decoded = decodeFunctionData({
            abi: universalResolverAbi,
            data: call.data,
          });
          expect(decoded.functionName).toBe("resolveWithGateways");
          const addressResult = encodeFunctionResult({
            abi: ensAddressAbi,
            functionName: "addr",
            result: account,
          });
          return encodeFunctionResult({
            abi: universalResolverAbi,
            functionName: "resolveWithGateways",
            result: [addressResult, resolver],
          }) as TResult;
        },
      },
    );

    expect(calls).toEqual([universalResolver.toLowerCase()]);
    expect(resolved).toMatchObject({
      resolvedAddress: account,
      resolvedEnsName: "vojtch.eth",
      blockNumber: "23123696",
    });
  });

  it("quotes Compound III through live SDK dependencies and Ethereum RPC reads", async () => {
    const engine = createPowerrrEngine({
      dataMode: "live",
      dependencies: createNuxtLiveEngineDependencies({
        readiness: {
          liveReady: false,
          missingRequiredEnvKeys: [],
          protocols: [],
        },
        diagnostics: [],
        clients: {
          ethereumRpc: createRpcMock() as never,
        },
      }),
    });

    const response = await engine.quotes({
      chainId: 1,
      input: { address: account },
      mode: "wallet-estimate",
      includeProtocols: ["compound-iii"],
      safetyProfile: "balanced",
    });

    expect(response.blockNumber).toBe("23123696");
    expect(response.portfolioSummary.discoveredAssets).toBe(2);
    expect(response.quotes).toHaveLength(1);
    expect(response.quotes[0]).toMatchObject({
      protocolId: "compound-iii",
      theoreticalBorrowUsd: 28_525,
      safeBorrowUsd: 24_246.25,
      availableLiquidityUsd: 750_000,
      provenance: [
        {
          sourceType: "on-chain",
          blockNumber: "23123696",
        },
      ],
    });
  });

  it("batches native/ERC-20 discovery and prices only positive registry balances", async () => {
    const batchSizes: number[] = [];
    const priceCalls: string[] = [];
    const rpc = {
      async request<TResult>(request: { method: string }) {
        if (request.method === "eth_blockNumber") return "0x160d6f0" as TResult;
        if (request.method === "eth_getBlockByNumber") {
          return { timestamp: "0x6877c680" } as TResult;
        }
        throw new Error(`Unexpected ${request.method}`);
      },
      async batch<TResult>(
        requests: Array<{ method: string; params?: unknown[] }>,
      ) {
        batchSizes.push(requests.length);
        return requests.map((request) => {
          if (request.method === "eth_getBalance") return "0xde0b6b3a7640000";
          const call = request.params?.[0] as { to: string; data: Hex };
          if (call.to.toLowerCase() === steth.toLowerCase()) {
            return encodeFunctionResult({
              abi: erc20Abi,
              functionName: "balanceOf",
              result: 2_000_000_000_000_000_000n,
            });
          }
          if (call.to.toLowerCase() === wsteth.toLowerCase()) {
            if (call.data.startsWith("0x70a08231")) {
              return encodeFunctionResult({
                abi: erc20Abi,
                functionName: "balanceOf",
                result: 0n,
              });
            }
            return encodeFunctionResult({
              abi: wstethAbi,
              functionName: "getWstETHByStETH",
              result: 1_700_000_000_000_000_000n,
            });
          }
          if (call.to.toLowerCase() === aaveOracle.toLowerCase()) {
            const decoded = decodeFunctionData({
              abi: oracleAbi,
              data: call.data,
            });
            if (decoded.functionName === "BASE_CURRENCY_UNIT") {
              return encodeFunctionResult({
                abi: oracleAbi,
                functionName: "BASE_CURRENCY_UNIT",
                result: 100_000_000n,
              });
            }
            priceCalls.push(String(decoded.args?.[0]));
            return encodeFunctionResult({
              abi: oracleAbi,
              functionName: "getAssetPrice",
              result: 300_000_000_000n,
            });
          }
          return encodeFunctionResult({
            abi: erc20Abi,
            functionName: "balanceOf",
            result: 0n,
          });
        }) as TResult[];
      },
    };
    const engine = createPowerrrEngine({
      dataMode: "live",
      dependencies: createNuxtLiveEngineDependencies({
        readiness: {
          liveReady: true,
          missingRequiredEnvKeys: [],
          protocols: [],
        },
        diagnostics: [],
        clients: { ethereumRpc: rpc as never },
      }),
    });

    const response = await engine.quotes({
      chainId: 1,
      input: { address: account },
      mode: "wallet-estimate",
      includeProtocols: ["aave-v4"],
    });

    expect(batchSizes).toEqual([23, 4]);
    expect(priceCalls).toHaveLength(2);
    expect(response.portfolio.assets.map((asset) => asset.symbol)).toEqual([
      "ETH",
      "stETH",
    ]);
    expect(response.portfolio.assets[0]).toMatchObject({
      assetKind: "native",
      requiredAction: "wrap",
      protocolBalanceRaw: "1000000000000000000",
    });
    expect(response.portfolio.assets[1]).toMatchObject({
      assetKind: "convertible",
      requiredAction: "wrap",
      protocolBalanceRaw: "1700000000000000000",
      conversion: { kind: "wsteth", toSymbol: "wstETH" },
    });
  });

  it("marks a requested protocol without an exact live adapter unavailable", async () => {
    const engine = createPowerrrEngine({
      dataMode: "live",
      dependencies: createNuxtLiveEngineDependencies({
        readiness: {
          liveReady: false,
          missingRequiredEnvKeys: [],
          protocols: [],
        },
        diagnostics: [],
        clients: {
          ethereumRpc: createRpcMock() as never,
        },
      }),
    });

    const response = await engine.quotes({
      chainId: 1,
      input: { address: account },
      mode: "wallet-estimate",
      includeProtocols: ["aave-v4"],
    });

    expect(response.quotes).toEqual([]);
    expect(response.protocolAvailability).toEqual([
      {
        protocolId: "aave-v4",
        status: "unavailable",
        code: "UNSUPPORTED",
        reason: "This provider is not supported",
      },
    ]);
  });

  it("marks Morpho unavailable when its official source is not configured", async () => {
    const engine = createPowerrrEngine({
      dataMode: "live",
      dependencies: createNuxtLiveEngineDependencies({
        readiness: {
          liveReady: false,
          missingRequiredEnvKeys: [],
          protocols: [],
        },
        diagnostics: [],
        clients: {
          ethereumRpc: createRpcMock() as never,
        },
      }),
    });

    const response = await engine.quotes({
      chainId: 1,
      input: { address: account },
      mode: "wallet-estimate",
      includeProtocols: ["morpho-blue"],
    });

    expect(response.quotes).toEqual([]);
    expect(response.protocolAvailability).toEqual([
      {
        protocolId: "morpho-blue",
        status: "unavailable",
        code: "NOT_CONFIGURED",
        reason: "Live estimate is not configured for this provider",
      },
    ]);
  });

  it("fails live dependency construction without an Ethereum RPC client", () => {
    const sources = createLiveSourceClients({});

    expect(() => createNuxtLiveEngineDependencies(sources)).toThrow(
      PowerrrEngineError,
    );
  });
});

function createRpcMock(): CompoundLiveRpcClient {
  return {
    async request<TResult>(request: {
      method: string;
      params?: unknown[];
    }): Promise<TResult> {
      if (request.method === "eth_blockNumber") {
        return "0x160d6f0" as TResult;
      }
      if (request.method === "eth_getBlockByNumber") {
        return { timestamp: "0x6877c680" } as TResult;
      }
      if (request.method === "eth_getBalance") {
        return "0x0" as TResult;
      }

      if (request.method !== "eth_call") {
        throw new Error(`Unexpected RPC method ${request.method}`);
      }

      const [call] = request.params ?? [];
      if (!isEthCall(call)) {
        throw new Error("Expected eth_call params");
      }

      if (call.to.toLowerCase() !== COMPOUND_USDC_COMET_MAINNET.toLowerCase()) {
        if (call.to.toLowerCase() === aaveOracle.toLowerCase()) {
          const decoded = decodeFunctionData({
            abi: oracleAbi,
            data: call.data,
          });
          if (decoded.functionName === "BASE_CURRENCY_UNIT") {
            return encodeFunctionResult({
              abi: oracleAbi,
              functionName: "BASE_CURRENCY_UNIT",
              result: 100_000_000n,
            }) as TResult;
          }
          return encodeFunctionResult({
            abi: oracleAbi,
            functionName: "getAssetPrice",
            result: 100_000_000n,
          }) as TResult;
        }
        const decoded = decodeFunctionData({
          abi: erc20Abi,
          data: call.data,
        });

        expect(decoded.functionName).toBe("balanceOf");
        return encodeFunctionResult({
          abi: erc20Abi,
          functionName: "balanceOf",
          result: walletBalanceFor(call.to),
        }) as TResult;
      }

      const decoded = decodeFunctionData({
        abi: cometAbi,
        data: call.data,
      } as never);

      return compoundResultFor(
        decoded.functionName,
        decoded.args ?? [],
      ) as TResult;
    },
  };
}

function walletBalanceFor(token: Address): bigint {
  if (token.toLowerCase() === weth.toLowerCase()) {
    return 2_000_000_000_000_000_000n;
  }

  if (token.toLowerCase() === wbtc.toLowerCase()) {
    return 50_000_000n;
  }

  return 0n;
}

function compoundResultFor(
  functionName: string,
  args: readonly unknown[],
): Hex {
  if (functionName === "numAssets") {
    return encodeComet(functionName, 2);
  }

  if (functionName === "baseScale") {
    return encodeComet(functionName, 1_000_000n);
  }

  if (functionName === "priceScale") {
    return encodeComet(functionName, 100_000_000n);
  }

  if (functionName === "totalSupply") {
    return encodeComet(functionName, 1_000_000_000_000n);
  }

  if (functionName === "totalBorrow") {
    return encodeComet(functionName, 250_000_000_000n);
  }

  if (functionName === "getUtilization") {
    return encodeComet(functionName, utilization);
  }

  if (functionName === "getBorrowRate") {
    return encodeComet(functionName, 1_585_489_599n);
  }

  if (functionName === "borrowBalanceOf") {
    return encodeComet(functionName, 0n);
  }

  if (functionName === "getAssetInfo") {
    return encodeComet(functionName, assetInfo(Number(args[0])));
  }

  if (functionName === "getPrice") {
    return encodeComet(
      functionName,
      args[0] === wethPriceFeed ? 350_000_000_000n : 6_500_000_000_000n,
    );
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

function encodeComet(functionName: string, result: unknown): Hex {
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
