import { ethereumTokenRegistryV1 } from "@powerrr/configs";
import {
  decodeFunctionData,
  encodeFunctionData,
  encodeFunctionResult,
  type Hex,
} from "viem";
import { describe, expect, it } from "vitest";
import {
  MULTICALL3_ADDRESS,
  createReadOnlyProvider,
  isCredibleTokenPriceUsd,
  scanConnectedWallet,
  type Eip1193Provider,
  type Eip1193Request,
} from "./static-discovery";

const account = "0x00000000000000000000000000000000000000A1";
const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const timestamp = 1_800_000_000;

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "value", type: "uint8" }],
  },
] as const;

const oracleAbi = [
  {
    type: "function",
    name: "BASE_CURRENCY_UNIT",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "unit", type: "uint256" }],
  },
  {
    type: "function",
    name: "getAssetPrice",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [{ name: "price", type: "uint256" }],
  },
] as const;

const multicall3Abi = [
  {
    type: "function",
    name: "aggregate3",
    stateMutability: "payable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "allowFailure", type: "bool" },
          { name: "callData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      {
        name: "returnData",
        type: "tuple[]",
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" },
        ],
      },
    ],
  },
] as const;

describe("static connected-wallet discovery", () => {
  it("rejects economically impossible prices before they reach portfolio totals", () => {
    expect(isCredibleTokenPriceUsd(0.000004)).toBe(true);
    expect(isCredibleTokenPriceUsd(100_000)).toBe(true);
    expect(isCredibleTokenPriceUsd(6.38e41)).toBe(false);
    expect(isCredibleTokenPriceUsd(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("scans the complete reviewed registry through Multicall3 and values positive WETH", async () => {
    const mock = createMockProvider({ positiveWeth: true });
    const result = await scanConnectedWallet({
      provider: mock.provider,
      account,
      walletName: "Test wallet",
      now: new Date(timestamp * 1_000 + 30_000),
    });

    expect(ethereumTokenRegistryV1.length).toBeGreaterThanOrEqual(250);
    expect(mock.multicallSizes[0]).toBe(ethereumTokenRegistryV1.length);
    expect(result.receipt).toMatchObject({
      callsAttempted: ethereumTokenRegistryV1.length,
      callsSucceeded: ethereumTokenRegistryV1.length,
      callsFailed: 0,
      postedToPowerrr: false,
      multicallAddress: MULTICALL3_ADDRESS,
      readCoverage: {
        balances: {
          attempted: ethereumTokenRegistryV1.length,
          succeeded: ethereumTokenRegistryV1.length,
          failed: 0,
        },
        metadata: { attempted: 1, succeeded: 1, failed: 0 },
        valuations: { attempted: 1, succeeded: 1, unavailable: 0 },
      },
    });
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0]).toMatchObject({
      symbol: "WETH",
      balance: "2",
      marketPriceUsd: 3_000,
      valuationStatus: "available",
    });
    expect(mock.methods).not.toContain("personal_sign");
    expect(mock.methods).not.toContain("eth_sendTransaction");
  });

  it("retries rejected payloads as 50-call and then 25-call chunks", async () => {
    const mock = createMockProvider({ rejectAbove: 25 });
    const result = await scanConnectedWallet({
      provider: mock.provider,
      account,
      walletName: "Limited RPC",
      now: new Date(timestamp * 1_000 + 30_000),
    });

    expect(mock.multicallSizes[0]).toBe(ethereumTokenRegistryV1.length);
    expect(mock.multicallSizes.slice(1).every((size) => size <= 50)).toBe(true);
    expect(mock.multicallSizes.some((size) => size === 25)).toBe(true);
    expect(result.receipt.callsSucceeded).toBe(ethereumTokenRegistryV1.length);
    expect(result.receipt.chunkSizes).toEqual(mock.multicallSizes);
  });

  it("maps native ETH to the WETH reserve for wallet-estimate protocol reads", async () => {
    const mock = createMockProvider({ nativeBalance: 2n * 10n ** 18n });
    const result = await scanConnectedWallet({
      provider: mock.provider,
      account,
      walletName: "Native wallet",
      now: new Date(timestamp * 1_000 + 30_000),
    });

    expect(result.assets[0]).toMatchObject({
      symbol: "ETH",
      balance: "2",
      balanceRaw: "2000000000000000000",
      protocolAssetToken: weth,
      protocolBalanceRaw: "2000000000000000000",
      protocolEligible: {
        "aave-v3": true,
        sparklend: true,
        "compound-iii": true,
      },
    });
  });

  it("keeps individual token failures visible without failing the scan", async () => {
    const mock = createMockProvider({ failedToken: weth });
    const result = await scanConnectedWallet({
      provider: mock.provider,
      account,
      walletName: "Partial RPC",
      now: new Date(timestamp * 1_000 + 30_000),
    });

    expect(result.receipt.callsFailed).toBe(1);
    expect(result.assets).toContainEqual(
      expect.objectContaining({
        symbol: "WETH",
        balanceReadStatus: "failed",
        valuationStatus: "failed",
      }),
    );
  });

  it("keeps a positive balance visible when token scale verification fails", async () => {
    const mock = createMockProvider({
      positiveWeth: true,
      failedDecimalsToken: weth,
    });
    const result = await scanConnectedWallet({
      provider: mock.provider,
      account,
      walletName: "Partial metadata RPC",
      now: new Date(timestamp * 1_000 + 30_000),
    });

    expect(result.receipt.readCoverage.metadata).toEqual({
      attempted: 1,
      succeeded: 0,
      failed: 1,
    });
    expect(result.assets).toContainEqual(
      expect.objectContaining({
        symbol: "WETH",
        balanceRaw: "2000000000000000000",
        balanceReadStatus: "failed",
        valuationStatus: "failed",
      }),
    );
  });

  it("stops a scan before wallet reads when its signal is cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      scanConnectedWallet({
        provider: createMockProvider({}).provider,
        account,
        walletName: "Cancelled wallet",
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("fails closed when the wallet RPC serves a stale block", async () => {
    const mock = createMockProvider({});
    await expect(
      scanConnectedWallet({
        provider: mock.provider,
        account,
        walletName: "Stale RPC",
        now: new Date(timestamp * 1_000 + 301_000),
      }),
    ).rejects.toThrow("older than five minutes");
  });

  it("blocks signing and transaction methods", async () => {
    const provider = createReadOnlyProvider({
      request: async <TResult>() => "0x1" as TResult,
    });
    await expect(
      provider.request({ method: "eth_sendTransaction", params: [] }),
    ).rejects.toThrow("blocks non-read-only RPC method");
    await expect(
      provider.request({ method: "personal_sign", params: [] }),
    ).rejects.toThrow("blocks non-read-only RPC method");
  });
});

function createMockProvider(options: {
  positiveWeth?: boolean;
  nativeBalance?: bigint;
  rejectAbove?: number;
  failedToken?: string;
  failedDecimalsToken?: string;
}): {
  provider: Eip1193Provider;
  methods: string[];
  multicallSizes: number[];
} {
  const methods: string[] = [];
  const multicallSizes: number[] = [];
  const provider: Eip1193Provider = {
    async request<TResult>(request: Eip1193Request): Promise<TResult> {
      methods.push(request.method);
      if (request.method === "eth_chainId") return "0x1" as TResult;
      if (request.method === "eth_blockNumber") return "0x1234" as TResult;
      if (request.method === "eth_getBlockByNumber") {
        return { timestamp: `0x${timestamp.toString(16)}` } as TResult;
      }
      if (request.method === "eth_getCode") return "0x60016000" as TResult;
      if (request.method === "eth_getBalance") {
        return `0x${(options.nativeBalance ?? 0n).toString(16)}` as TResult;
      }
      if (request.method !== "eth_call") {
        throw new Error(`Unexpected method ${request.method}`);
      }
      const params = request.params as readonly [{ data: Hex }, Hex];
      const decoded = decodeFunctionData({
        abi: multicall3Abi,
        data: params[0].data,
      });
      const calls = decoded.args[0];
      multicallSizes.push(calls.length);
      if (options.rejectAbove && calls.length > options.rejectAbove) {
        throw new Error("payload too large");
      }
      const results = calls.map((call) => {
        const failed =
          (options.failedToken?.toLowerCase() === call.target.toLowerCase() &&
            call.callData.startsWith("0x70a08231")) ||
          (options.failedDecimalsToken?.toLowerCase() ===
            call.target.toLowerCase() &&
            call.callData ===
              encodeFunctionData({
                abi: erc20Abi,
                functionName: "decimals",
              }));
        return {
          success: !failed,
          returnData: failed
            ? ("0x" as const)
            : mockInnerResult(
                call.target,
                call.callData,
                Boolean(options.positiveWeth),
              ),
        };
      });
      return encodeFunctionResult({
        abi: multicall3Abi,
        functionName: "aggregate3",
        result: results,
      }) as TResult;
    },
  };
  return { provider, methods, multicallSizes };
}

function mockInnerResult(
  target: string,
  data: Hex,
  positiveWeth: boolean,
): Hex {
  if (data.startsWith("0x70a08231")) {
    return encodeFunctionResult({
      abi: erc20Abi,
      functionName: "balanceOf",
      result:
        positiveWeth && target.toLowerCase() === weth.toLowerCase()
          ? 2_000_000_000_000_000_000n
          : 0n,
    });
  }
  if (
    data === encodeFunctionData({ abi: erc20Abi, functionName: "decimals" })
  ) {
    const token = ethereumTokenRegistryV1.find(
      (item) => item.address.toLowerCase() === target.toLowerCase(),
    );
    return encodeFunctionResult({
      abi: erc20Abi,
      functionName: "decimals",
      result: token?.decimals ?? 18,
    });
  }
  if (
    data ===
    encodeFunctionData({
      abi: oracleAbi,
      functionName: "BASE_CURRENCY_UNIT",
    })
  ) {
    return encodeFunctionResult({
      abi: oracleAbi,
      functionName: "BASE_CURRENCY_UNIT",
      result: 100_000_000n,
    });
  }
  return encodeFunctionResult({
    abi: oracleAbi,
    functionName: "getAssetPrice",
    result: 300_000_000_000n,
  });
}
