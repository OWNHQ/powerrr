import { describe, expect, it } from "vitest";
import { loadMorphoSnapshot } from "./morpho-live-source.js";

describe("Morpho live source", () => {
  it("normalizes listed official-API markets for wallet collateral", async () => {
    const snapshot = await loadMorphoSnapshot({
      address: "0x1111111111111111111111111111111111111111",
      chainId: 1,
      mode: "wallet-estimate",
      safetyProfile: "balanced",
      targetBorrowAssets: ["USDC"],
      now: new Date("2026-07-15T12:00:30.000Z"),
      portfolio: [
        {
          chainId: 1,
          token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
          symbol: "WETH",
          name: "Wrapped Ether",
          decimals: 18,
          balance: "2",
          balanceRaw: "2000000000000000000",
          protocolEligible: { "morpho-blue": true },
        },
      ],
      graphQl: {
        async request() {
          return {
            markets: {
              items: [
                {
                  marketId: "0xmarket",
                  lltv: "860000000000000000",
                  loanAsset: {
                    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                    symbol: "USDC",
                  },
                  collateralAsset: {
                    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
                    symbol: "WETH",
                    price: { usd: 3_000, timestamp: 1_783_684_800 },
                  },
                  state: { liquidityAssetsUsd: 2_000_000, borrowApy: 0.052 },
                },
              ],
            },
          };
        },
      } as never,
    });

    expect(snapshot).toMatchObject({
      sourceType: "official-api",
      existingDebtUsd: 0,
      availableLiquidityUsd: 2_000_000,
      indicativeApr: null,
    });
    expect(snapshot.markets[0]).toMatchObject({
      valueUsd: 6_000,
      lltv: 0.86,
      marketId: "0xmarket",
      borrowApy: 0.052,
    });
  });
});
