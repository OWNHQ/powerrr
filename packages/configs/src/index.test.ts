import { describe, expect, it } from "vitest";
import { isAddress } from "viem";
import {
  AAVE_V3_ORACLE,
  ETHEREUM_ASSET_REGISTRY_VERSION,
  ETHEREUM_NATIVE_TOKEN,
  ETHEREUM_MORPHO_USDC_MARKET_MANIFEST_VERSION,
  ETHEREUM_MORPHO_USDC_EXECUTABLE_COUNT,
  ETHEREUM_MORPHO_USDC_OFFICIAL_LISTED_COUNT,
  ETHEREUM_TOKEN_REGISTRY_VERSION,
  ETHEREUM_TOKEN_REGISTRY_RANKED_COUNT,
  ETHEREUM_TOKEN_REGISTRY_ADDITION_COUNT,
  ETHEREUM_TOKEN_REGISTRY_TOTAL_COUNT,
  MORPHO_BLUE,
  SPARK_ORACLE,
  ethereumAssetRegistryV1,
  ethereumMorphoUsdcMarketsV1,
  ethereumMorphoUsdcOfficialMarketIdsV1,
  ethereumMorphoCollateralTokensV1,
  ethereumTokenRegistryV1,
  ethereumTokenRegistryAdditionsV1,
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
      "eBTC",
      "BTC.b",
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
      } else if (token.priceRoute.kind === "chainlink-feed") {
        addresses.push([
          `${token.symbol} direct Chainlink feed`,
          token.priceRoute.feed,
        ]);
      } else if (token.priceRoute.kind === "morpho-oracle") {
        addresses.push([
          `${token.symbol} Morpho price oracle`,
          token.priceRoute.oracle,
        ]);
      } else if (
        token.priceRoute.kind === "erc4626-rate" ||
        token.priceRoute.kind === "contract-rate" ||
        token.priceRoute.kind === "conversion-rate"
      ) {
        addresses.push([
          `${token.symbol} price underlying`,
          token.priceRoute.underlying,
        ]);
        if (token.priceRoute.kind === "conversion-rate") {
          addresses.push([
            `${token.symbol} conversion contract`,
            token.priceRoute.conversionContract,
          ]);
        }
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
  it("pins 250 ranked contracts plus reviewed provider-path additions", () => {
    expect(ETHEREUM_TOKEN_REGISTRY_VERSION).toBe(
      "ethereum-top250-2026-07-29-v1",
    );
    expect(ETHEREUM_TOKEN_REGISTRY_RANKED_COUNT).toBe(250);
    expect(ETHEREUM_TOKEN_REGISTRY_ADDITION_COUNT).toBe(78);
    expect(ETHEREUM_TOKEN_REGISTRY_TOTAL_COUNT).toBe(328);
    expect(ethereumTokenRegistryV1).toHaveLength(328);
    expect(
      ethereumTokenRegistryAdditionsV1.map((token) => token.symbol),
    ).toEqual(expect.arrayContaining(["BTC.b", "eBTC", "LINK", "MKR"]));
    expect(
      new Set(
        ethereumTokenRegistryV1.map((token) => token.address.toLowerCase()),
      ).size,
    ).toBe(ethereumTokenRegistryV1.length);
  });

  it("allows only the two reviewed deterministic conversion families", () => {
    const converted = ethereumAssetRegistryV1.filter(
      (asset) => asset.protocolAssetToken,
    );
    expect(
      converted.map((asset) => [asset.symbol, asset.conversion?.kind]),
    ).toEqual([
      ["ETH", "one-to-one"],
      ["stETH", "wsteth"],
    ]);
  });

  it("pins newly discovered Aave collateral to the reviewed provider and oracle", () => {
    for (const symbol of ["eBTC", "BTC.b"]) {
      const asset = ethereumAssetRegistryV1.find(
        (candidate) => candidate.symbol === symbol,
      );
      const discovery = ethereumTokenRegistryV1.find(
        (candidate) => candidate.symbol === symbol,
      );

      expect(asset?.candidateProviders).toEqual(["aave-v3"]);
      expect(asset?.priceSource.oracle).toBe(AAVE_V3_ORACLE);
      expect(discovery?.priceRoute).toMatchObject({
        kind: "aave-oracle",
        oracle: AAVE_V3_ORACLE,
      });
    }
  });

  it("contains immutable metadata and an explicit price status", () => {
    for (const token of ethereumTokenRegistryV1) {
      expect(token.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(token.decimals).toBeGreaterThan(0);
      expect(token.decimals).toBeLessThanOrEqual(36);
      expect([
        "aave-oracle",
        "chainlink-feed",
        "erc4626-rate",
        "contract-rate",
        "conversion-rate",
        "morpho-oracle",
        "automatic-onchain",
      ]).toContain(token.priceRoute.kind);
      expect(["2026-07-29", "2026-08-06"]).toContain(token.snapshotDate);
      expect(token.rankingSource).toMatch(/CoinGecko|Morpho official/);
    }
  });

  it("pins reviewed direct-feed and deterministic wrapper routes by contract", () => {
    expect(
      ethereumTokenRegistryV1.find((token) => token.symbol === "ARB")
        ?.priceRoute,
    ).toMatchObject({
      kind: "chainlink-feed",
      feed: "0x31697852a68433DbCc2Ff612c516d69E3D9bd08F",
    });
    expect(
      ethereumTokenRegistryV1.find((token) => token.symbol === "SUSDC")
        ?.priceRoute,
    ).toMatchObject({
      kind: "erc4626-rate",
      underlying: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    });
    expect(
      ethereumTokenRegistryV1.find((token) => token.symbol === "CDAI")
        ?.priceRoute,
    ).toMatchObject({
      kind: "contract-rate",
      method: "exchangeRateStored",
      underlying: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    });
  });

  it("pins the current deployed GHO contract", () => {
    expect(
      ethereumTokenRegistryV1.find((token) => token.symbol === "GHO")?.address,
    ).toBe("0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f");
  });
});

describe("static Morpho USDC market manifest", () => {
  it("pins the complete official set and a structurally executable runtime subset", () => {
    expect(ETHEREUM_MORPHO_USDC_MARKET_MANIFEST_VERSION).toBe(
      "ethereum-morpho-usdc-25744807-v1",
    );
    expect(ETHEREUM_MORPHO_USDC_OFFICIAL_LISTED_COUNT).toBe(119);
    expect(ethereumMorphoUsdcOfficialMarketIdsV1).toHaveLength(119);
    expect(ETHEREUM_MORPHO_USDC_EXECUTABLE_COUNT).toBe(117);
    expect(ethereumMorphoUsdcMarketsV1).toHaveLength(117);
    expect(ethereumMorphoCollateralTokensV1).toHaveLength(106);
    expect(
      new Set(ethereumMorphoUsdcMarketsV1.map((market) => market.marketId))
        .size,
    ).toBe(ethereumMorphoUsdcMarketsV1.length);
    expect(
      ethereumMorphoUsdcMarketsV1.some(
        (market) =>
          market.collateralToken.toLowerCase() ===
            "0x0000000000000000000000000000000000000000" ||
          market.oracle.toLowerCase() ===
            "0x0000000000000000000000000000000000000000" ||
          market.irm.toLowerCase() ===
            "0x0000000000000000000000000000000000000000",
      ),
    ).toBe(false);
    for (const market of ethereumMorphoUsdcMarketsV1) {
      expect(market.collateralDecimals).toBeGreaterThan(0);
      expect(market.collateralDecimals).toBeLessThanOrEqual(36);
      expect(BigInt(market.lltv)).toBeGreaterThan(0n);
      expect(BigInt(market.lltv)).toBeLessThanOrEqual(10n ** 18n);
    }
    expect(
      ethereumMorphoUsdcMarketsV1.some(
        (market) =>
          market.collateralToken.toLowerCase() ===
          "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      ),
    ).toBe(false);
    expect(
      ethereumMorphoUsdcMarketsV1.map((market) => String(market.marketId)),
    ).not.toContain(
      "0x54efdee08e272e929034a8f26f7ca34b1ebe364b275391169b28c6d7db24dbc8",
    );
    expect(ethereumMorphoUsdcMarketsV1).toContainEqual(
      expect.objectContaining({
        marketId:
          "0x94b823e6bd8ea533b4e33fbc307faea0b307301bc48763acc4d4aa4def7636cd",
        loanSymbol: "USDC",
        collateralSymbol: "WETH",
        lltv: "860000000000000000",
      }),
    );
    for (const collateral of ethereumMorphoCollateralTokensV1) {
      const discovery = ethereumTokenRegistryV1.find(
        (token) =>
          token.address.toLowerCase() === collateral.address.toLowerCase(),
      );
      expect(discovery, collateral.symbol).toBeDefined();
      expect(discovery?.decimals).toBe(collateral.decimals);
      if (collateral.priceOracle && collateral.priceMarketId) {
        expect(discovery?.priceRoute.kind, collateral.symbol).not.toBe(
          "automatic-onchain",
        );
      }
    }
  });
});
