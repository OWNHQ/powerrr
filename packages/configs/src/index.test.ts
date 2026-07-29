import { describe, expect, it } from "vitest";
import {
  ETHEREUM_ASSET_REGISTRY_VERSION,
  ETHEREUM_NATIVE_TOKEN,
  ETHEREUM_MORPHO_USDC_MARKET_MANIFEST_VERSION,
  ETHEREUM_OWN_TOKEN_REGISTRY_VERSION,
  ethereumAssetRegistryV1,
  ethereumMorphoUsdcMarketsV1,
  ethereumOwnTokenRegistryV1,
} from "./index.js";

describe("Ethereum blue-chip registry", () => {
  it("is versioned and contains the exact reviewed symbols", () => {
    expect(ETHEREUM_ASSET_REGISTRY_VERSION).toBe("ethereum-blue-chip-v1");
    expect(ethereumAssetRegistryV1.map((asset) => asset.symbol)).toEqual([
      "ETH",
      "WETH",
      "stETH",
      "wstETH",
      "rETH",
      "cbETH",
      "WBTC",
      "cbBTC",
      "tBTC",
      "USDC",
      "USDT",
      "DAI",
      "sDAI",
      "USDS",
      "sUSDS",
      "GHO",
      "PYUSD",
      "LINK",
      "AAVE",
      "UNI",
      "MKR",
      "LDO",
      "ENS",
    ]);
  });

  it("has complete metadata and no duplicate canonical addresses", () => {
    const addresses = ethereumAssetRegistryV1.map((asset) =>
      asset.address.toLowerCase(),
    );
    expect(new Set(addresses).size).toBe(addresses.length);
    for (const asset of ethereumAssetRegistryV1) {
      expect(asset.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(asset.decimals).toBeGreaterThan(0);
      expect(asset.candidateProviders.length).toBeGreaterThan(0);
      expect(asset.iconKey).not.toBe("");
      expect(asset.priceSource.asset).toMatch(/^0x[a-fA-F0-9]{40}$/);
    }
    expect(ethereumAssetRegistryV1[0]).toMatchObject({
      address: ETHEREUM_NATIVE_TOKEN,
      assetKind: "native",
      requiredAction: "wrap",
      conversion: { kind: "one-to-one" },
    });
  });
});

describe("static OWN token registry", () => {
  it("pins exactly 100 unique Ethereum ERC-20 contracts", () => {
    expect(ETHEREUM_OWN_TOKEN_REGISTRY_VERSION).toBe(
      "ethereum-own-top100-2026-07-21-r2",
    );
    expect(ethereumOwnTokenRegistryV1).toHaveLength(100);
    expect(
      new Set(
        ethereumOwnTokenRegistryV1.map((token) => token.address.toLowerCase()),
      ).size,
    ).toBe(100);
  });

  it("contains immutable metadata, price status, and an explicit OWN policy", () => {
    for (const token of ethereumOwnTokenRegistryV1) {
      expect(token.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(token.decimals).toBeGreaterThan(0);
      expect(token.decimals).toBeLessThanOrEqual(36);
      expect(token.ownPolicy.eligible).toBe(true);
      expect(token.ownPolicy.advanceRate).toBeGreaterThan(0);
      expect(token.ownPolicy.valuationHaircut).toBeGreaterThanOrEqual(0);
      expect(token.ownPolicy.contributionCapUsd).toBeGreaterThan(0);
      expect(["aave-oracle", "unavailable"]).toContain(token.priceRoute.kind);
    }
  });

  it("pins the current deployed GHO contract", () => {
    expect(
      ethereumOwnTokenRegistryV1.find((token) => token.symbol === "GHO")
        ?.address,
    ).toBe("0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f");
  });
});

describe("static Morpho USDC market manifest", () => {
  it("pins a reviewed WETH market with complete immutable parameters", () => {
    expect(ETHEREUM_MORPHO_USDC_MARKET_MANIFEST_VERSION).toBe(
      "ethereum-morpho-usdc-2026-07-21-v1",
    );
    expect(ethereumMorphoUsdcMarketsV1).toHaveLength(1);
    expect(ethereumMorphoUsdcMarketsV1[0]).toMatchObject({
      marketId:
        "0x94b823e6bd8ea533b4e33fbc307faea0b307301bc48763acc4d4aa4def7636cd",
      loanSymbol: "USDC",
      collateralSymbol: "WETH",
      lltv: 860_000_000_000_000_000n,
    });
  });
});
