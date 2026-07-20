import { describe, expect, it } from "vitest";
import {
  ETHEREUM_ASSET_REGISTRY_VERSION,
  ETHEREUM_NATIVE_TOKEN,
  ethereumAssetRegistryV1,
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
