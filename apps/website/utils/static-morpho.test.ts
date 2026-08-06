import { MORPHO_BLUE, ethereumMorphoUsdcMarketsV1 } from "@powerrr/configs";
import type { PortfolioAsset, ReadReceipt } from "@powerrr/shared-types";
import {
  decodeFunctionData,
  encodeFunctionData,
  encodeFunctionResult,
  type Address,
  type Hex,
} from "viem";
import { describe, expect, it } from "vitest";
import {
  MULTICALL3_ADDRESS,
  type Eip1193Provider,
  type Eip1193Request,
} from "./static-discovery";
import { loadStaticMorphoSnapshot } from "./static-morpho";
import { projectLiveSnapshots } from "@powerrr/protocol-adapters";

const manifest = ethereumMorphoUsdcMarketsV1.find(
  (market) =>
    market.marketId ===
    "0x94b823e6bd8ea533b4e33fbc307faea0b307301bc48763acc4d4aa4def7636cd",
)!;

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

describe("static Morpho market reader", () => {
  it("maps native ETH to WETH and reads capacity at the pinned block", async () => {
    const blockTags: unknown[] = [];
    const borrowAssetsSeenByIrm: bigint[] = [];
    const provider: Eip1193Provider = {
      async request<TResult>(request: Eip1193Request): Promise<TResult> {
        expect(request.method).toBe("eth_call");
        const [call, blockTag] = request.params as [
          { to: Address; data: Hex },
          Hex,
        ];
        blockTags.push(blockTag);
        expect(call.to.toLowerCase()).toBe(MULTICALL3_ADDRESS.toLowerCase());
        const decoded = decodeFunctionData({
          abi: multicall3Abi,
          data: call.data,
        });
        const responses = decoded.args[0].map((nested) => {
          try {
            if (nested.target.toLowerCase() === MORPHO_BLUE.toLowerCase()) {
              const morphoCall = decodeFunctionData({
                abi: morphoAbi,
                data: nested.callData,
              });
              const marketId = morphoCall.args[0];
              if (marketId !== manifest.marketId) {
                return { success: false, returnData: "0x" as Hex };
              }
              return {
                success: true,
                returnData:
                  morphoCall.functionName === "idToMarketParams"
                    ? encodeFunctionResult({
                        abi: morphoAbi,
                        functionName: "idToMarketParams",
                        result: [
                          manifest.loanToken,
                          manifest.collateralToken,
                          manifest.oracle,
                          manifest.irm,
                          BigInt(manifest.lltv),
                        ],
                      })
                    : encodeFunctionResult({
                        abi: morphoAbi,
                        functionName: "market",
                        result: [
                          1_000_000n * 10n ** 6n,
                          1_000_000n * 10n ** 6n,
                          400_000n * 10n ** 6n,
                          400_000n * 10n ** 6n,
                          1_799_900_000n,
                          0n,
                        ],
                      }),
              };
            }
            if (nested.target.toLowerCase() === manifest.oracle.toLowerCase()) {
              return {
                success: true,
                returnData: encodeFunctionResult({
                  abi: oracleAbi,
                  functionName: "price",
                  result: 3_000n * 10n ** 24n,
                }),
              };
            }
            if (nested.target.toLowerCase() === manifest.irm.toLowerCase()) {
              const irmCall = decodeFunctionData({
                abi: irmAbi,
                data: nested.callData,
              });
              const market = irmCall.args[1];
              borrowAssetsSeenByIrm.push(market.totalBorrowAssets);
              return {
                success: true,
                returnData: encodeFunctionResult({
                  abi: irmAbi,
                  functionName: "borrowRateView",
                  result: 1_585_489_599n,
                }),
              };
            }
          } catch {
            // A single failed nested call remains isolated by aggregate3.
          }
          return { success: false, returnData: "0x" as Hex };
        });
        return encodeFunctionResult({
          abi: multicall3Abi,
          functionName: "aggregate3",
          result: responses,
        }) as TResult;
      },
    };
    const portfolio: PortfolioAsset[] = [
      {
        chainId: 1,
        token: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        symbol: "ETH",
        name: "Ether",
        decimals: 18,
        balance: "2",
        balanceRaw: "2000000000000000000",
        protocolAssetToken: manifest.collateralToken,
        protocolBalanceRaw: "2000000000000000000",
        requiredAction: "wrap",
        protocolEligible: { "morpho-blue": true },
      },
      {
        chainId: 1,
        token: manifest.collateralToken,
        symbol: "WETH",
        name: "Wrapped Ether",
        decimals: 18,
        balance: "1",
        balanceRaw: "1000000000000000000",
        protocolEligible: { "morpho-blue": true },
      },
    ];

    const snapshot = await loadStaticMorphoSnapshot({
      provider,
      portfolio,
      receipt: receiptFixture(),
    });

    expect(snapshot).toMatchObject({
      sourceType: "on-chain",
      availableLiquidityUsd: 600_000,
    });
    expect(snapshot.markets[0]).toMatchObject({
      symbol: "ETH + WETH",
      valueUsd: 9_000,
      lltv: 0.86,
      availableLiquidityUsd: 600_000,
    });
    const projected = projectLiveSnapshots(
      [snapshot],
      portfolio.map((asset) => asset.token),
    )[0]!;
    expect(projected.assetEvaluations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          symbol: "ETH",
          eligibilityStatus: "supported",
          contributionUsd: 6_000,
          reasonCodes: ["CONVERSION_REQUIRED"],
        }),
        expect.objectContaining({
          symbol: "WETH",
          eligibilityStatus: "included",
          contributionUsd: 3_000,
          reasonCodes: ["INCLUDED"],
        }),
      ]),
    );
    expect(snapshot.markets[0]?.borrowApy).toBeCloseTo(0.05127, 4);
    expect(borrowAssetsSeenByIrm).toHaveLength(2);
    expect(borrowAssetsSeenByIrm[1]).toBeGreaterThan(borrowAssetsSeenByIrm[0]!);
    expect(new Set(blockTags)).toEqual(new Set(["0x1234"]));
  });
});

function receiptFixture(): ReadReceipt {
  return {
    walletName: "Test wallet",
    account: "0x00000000000000000000000000000000000000a1",
    chainId: 1,
    blockNumber: "4660",
    blockTimestamp: "2027-01-15T08:00:00.000Z",
    blockAgeSeconds: 20,
    registryVersion: "test",
    multicallAddress: "0xcA11bde05977b3631167028862bE2a173976CA11",
    callsAttempted: 100,
    callsSucceeded: 100,
    callsFailed: 0,
    chunkSizes: [100],
    priceSources: [],
    postedToPowerrr: false,
  };
}
