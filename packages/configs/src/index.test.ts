import { describe, expect, it } from "vitest";
import { isAddress } from "viem";
import {
  AAVE_V3_ORACLE,
  ETHEREUM_ASSET_REGISTRY_VERSION,
  ETHEREUM_NATIVE_TOKEN,
  ETHEREUM_MORPHO_USDC_MARKET_MANIFEST_VERSION,
  ETHEREUM_TOKEN_REGISTRY_VERSION,
  MORPHO_BLUE,
  SPARK_ORACLE,
  ethereumAssetRegistryV1,
  ethereumMorphoUsdcMarketsV1,
  ethereumTokenRegistryV1,
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

  it("contains only valid Ethereum address values", () => {
    const addresses: Array<[string, string]> = [
      ["Aave oracle", AAVE_V3_ORACLE],
      ["Spark oracle", SPARK_ORACLE],
      ["Morpho Blue", MORPHO_BLUE],
    ];

    for (const asset of ethereumAssetRegistryV1) {
      addresses.push(
        [`${asset.symbol} address`, asset.address],
        [`${asset.symbol} price asset`, asset.priceSource.asset],
        [`${asset.symbol} price oracle`, asset.priceSource.oracle],
      );
      if (asset.protocolAssetToken) {
        addresses.push([
          `${asset.symbol} protocol asset`,
          asset.protocolAssetToken,
        ]);
      }
      if (asset.conversion?.contract) {
        addresses.push([
          `${asset.symbol} conversion contract`,
          asset.conversion.contract,
        ]);
      }
    }

    for (const token of ethereumTokenRegistryV1) {
      addresses.push([`${token.symbol} discovery address`, token.address]);
      if (token.priceRoute.kind === "aave-oracle") {
        addresses.push(
          [`${token.symbol} discovery price asset`, token.priceRoute.asset],
          [`${token.symbol} discovery oracle`, token.priceRoute.oracle],
        );
      }
    }

    for (const market of ethereumMorphoUsdcMarketsV1) {
      addresses.push(
        [`${market.marketId} loan token`, market.loanToken],
        [`${market.marketId} collateral token`, market.collateralToken],
        [`${market.marketId} oracle`, market.oracle],
        [`${market.marketId} IRM`, market.irm],
      );
    }

    for (const [label, address] of addresses) {
      expect(isAddress(address, { strict: true }), label).toBe(true);
    }
  });
});

describe("static token registry", () => {
  it("pins at least 250 unique Ethereum ERC-20 contracts", () => {
    expect(ETHEREUM_TOKEN_REGISTRY_VERSION).toBe(
      "ethereum-top250-2026-07-29-v1",
    );
    expect(ethereumTokenRegistryV1.length).toBeGreaterThanOrEqual(250);
    expect(ethereumTokenRegistryV1.length).toBeLessThanOrEqual(275);
    expect(
      new Set(
        ethereumTokenRegistryV1.map((token) => token.address.toLowerCase()),
      ).size,
    ).toBe(ethereumTokenRegistryV1.length);
  });

  it("contains immutable metadata and an explicit price status", () => {
    for (const token of ethereumTokenRegistryV1) {
      expect(token.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(token.decimals).toBeGreaterThan(0);
      expect(token.decimals).toBeLessThanOrEqual(36);
      expect(["aave-oracle", "automatic-onchain"]).toContain(
        token.priceRoute.kind,
      );
      expect(token.snapshotDate).toBe("2026-07-29");
      expect(token.rankingSource).toContain("CoinGecko");
    }
  });

  it("pins the current deployed GHO contract", () => {
    expect(
      ethereumTokenRegistryV1.find((token) => token.symbol === "GHO")?.address,
    ).toBe("0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f");
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
