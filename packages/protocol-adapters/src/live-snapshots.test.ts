import { describe, expect, it } from "vitest";
import {
  buildMorphoBorrowRoute,
  quoteAaveLikeLiveSnapshot,
  quoteCompoundLiveSnapshot,
  quoteLiveSnapshots,
  quoteMorphoLiveSnapshot,
  projectLiveSnapshots,
  type LiveConfidencePenalties,
  type CompoundLiveCollateralSnapshot,
  type LiveCollateralSnapshot,
  type MorphoLiveMarketSnapshot,
  type RawCollateralGroup,
  type LiveQuoteSnapshot,
  type LiveProtocolSnapshot,
} from "./live-snapshots.js";
import type { IsolatedMarketCapacity } from "@powerrr/shared-types";

const confidencePenalties: LiveConfidencePenalties = {
  sourcePenalty: 1,
  stalenessPenalty: 1,
  fallbackPenalty: 0,
  complexityPenalty: 3,
  liquidityPenalty: 0,
};

const baseSnapshot: LiveProtocolSnapshot = {
  protocolId: "aave-v3",
  protocolLabel: "Aave v3",
  familyId: "aave",
  familyLabel: "Aave",
  chainId: 1,
  mode: "existing-position",
  targetBorrowAsset: "USDC",
  indicativeApr: 0.052,
  existingDebtUsd: 25_000,
  availableLiquidityUsd: 1_000_000,
  availableLiquidityExact: usd(1_000_000),
  existingDebtExact: usd(25_000),
  source: "Aave official GraphQL test snapshot",
  sourceType: "official-api",
  freshnessSeconds: 12,
  blockNumber: "23123456",
  now: new Date("2026-07-01T12:00:00.000Z"),
  assumptions: [
    "Live snapshot values are normalized before quote construction.",
  ],
  warnings: [],
  confidencePenalties,
};

function usd(value: number) {
  return { raw: BigInt(Math.round(value * 1_000_000)).toString(), decimals: 6 };
}

function ratio(value: number) {
  return {
    numerator: BigInt(Math.round(value * 1_000_000)).toString(),
    denominator: "1000000",
  };
}

function liveCollateral(
  token: `0x${string}`,
  symbol: string,
  valueUsd: number,
  ltv: number,
  liquidationThreshold: number,
): LiveCollateralSnapshot {
  return {
    token,
    symbol,
    valueUsd,
    ltv,
    liquidationThreshold,
    valueExact: usd(valueUsd),
    ltvExact: ratio(ltv),
    liquidationThresholdExact: ratio(liquidationThreshold),
  };
}

function compoundCollateral(
  token: `0x${string}`,
  symbol: string,
  valueUsd: number,
  borrowFactor: number,
  liquidationFactor: number,
): CompoundLiveCollateralSnapshot {
  return {
    token,
    symbol,
    valueUsd,
    borrowCollateralFactor: borrowFactor,
    liquidateCollateralFactor: liquidationFactor,
    valueExact: usd(valueUsd),
    borrowCollateralFactorExact: ratio(borrowFactor),
    liquidateCollateralFactorExact: ratio(liquidationFactor),
  };
}

function rawGroup(
  token: `0x${string}`,
  symbol: string,
  valueUsd: number,
  ltv: number,
  liquidationThreshold: number,
): RawCollateralGroup {
  return {
    protocolToken: token,
    protocolSymbol: symbol,
    protocolDecimals: 6,
    sources: [{ token, symbol, convertedBalanceRaw: usd(valueUsd).raw }],
    priceRaw: "1",
    valueNumeratorScale: "1",
    valueDenominator: "1",
    ltv: ratio(ltv),
    liquidationThreshold: ratio(liquidationThreshold),
  };
}

function morphoMarket(
  token: `0x${string}`,
  symbol: string,
  valueUsd: number,
  lltv: number,
  marketId: string,
  availableLiquidityUsd: number,
  borrowApy: number,
): MorphoLiveMarketSnapshot {
  const group = rawGroup(token, symbol, valueUsd, lltv, lltv);
  group.marketId = marketId;
  return {
    token,
    symbol,
    valueUsd,
    valueExact: usd(valueUsd),
    lltv,
    marketId,
    availableLiquidityUsd,
    availableLiquidityExact: usd(availableLiquidityUsd),
    borrowApy,
    loanToken: "0x0000000000000000000000000000000000000100",
    collateralToken: token,
    oracle: "0x0000000000000000000000000000000000000200",
    irm: "0x0000000000000000000000000000000000000300",
    totalSupplyAssets: usd(availableLiquidityUsd),
    totalBorrowAssets: usd(0),
    lastUpdate: "0",
    fee: ratio(0),
    collateralAvailableExact: usd(valueUsd),
    borrowRatePerSecond: {
      numerator: BigInt(
        Math.round((Math.log1p(borrowApy) / 31_536_000) * 1e18),
      ).toString(),
      denominator: "1000000000000000000",
    },
    rawCollateral: group,
  };
}

describe("live protocol snapshot quote builders", () => {
  it("shares a binding WETH supply cap only across the selected ETH/WETH balance", () => {
    const eth = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as const;
    const weth = "0x0000000000000000000000000000000000000001" as const;
    const source: LiveQuoteSnapshot = {
      ...baseSnapshot,
      kind: "aave-like",
      mode: "wallet-estimate",
      existingDebtUsd: 0,
      existingDebtExact: usd(0),
      safetyProfile: "max",
      targetHealthFactor: 1,
      collateral: [],
      rawCollateral: [
        {
          ...rawGroup(weth, "WETH", 0, 0.8, 0.83),
          sources: [
            { token: eth, symbol: "ETH", convertedBalanceRaw: usd(10).raw },
            { token: weth, symbol: "WETH", convertedBalanceRaw: usd(10).raw },
          ],
          remainingSupplyRaw: usd(15).raw,
        },
      ],
    };

    const ethOnly = quoteLiveSnapshots({
      snapshots: projectLiveSnapshots([source], [eth]),
    })[0]!;
    const both = quoteLiveSnapshots({
      snapshots: projectLiveSnapshots([source], [eth, weth]),
    })[0]!;

    expect(ethOnly.capacityBreakdown?.exact.collateralValue.raw).toBe(
      usd(10).raw,
    );
    expect(ethOnly.exactMaximum.raw).toBe(usd(8).raw);
    expect(both.capacityBreakdown?.exact.collateralValue.raw).toBe(usd(15).raw);
    expect(both.exactMaximum.raw).toBe(usd(12).raw);
  });

  it("keeps weETH separate from the reviewed ETH/WETH conversion family", () => {
    const eth = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as const;
    const weth = "0x0000000000000000000000000000000000000001" as const;
    const weeth = "0xcd5fe23c85820f7b72d0926fc9b05b43e359b7ee" as const;
    const wethGroup = rawGroup(weth, "WETH", 0, 0.8, 0.83);
    wethGroup.sources = [
      { token: eth, symbol: "ETH", convertedBalanceRaw: usd(10).raw },
      { token: weth, symbol: "WETH", convertedBalanceRaw: usd(10).raw },
    ];
    const weethGroup = rawGroup(weeth, "weETH", 0, 0.775, 0.8);
    weethGroup.sources = [
      { token: weeth, symbol: "WEETH", convertedBalanceRaw: usd(7).raw },
    ];
    const source: LiveQuoteSnapshot = {
      ...baseSnapshot,
      kind: "aave-like",
      mode: "wallet-estimate",
      existingDebtUsd: 0,
      existingDebtExact: usd(0),
      safetyProfile: "max",
      targetHealthFactor: 1,
      collateral: [],
      rawCollateral: [wethGroup, weethGroup],
    };

    const quote = quoteLiveSnapshots({
      snapshots: projectLiveSnapshots([source], [weeth]),
    })[0]!;

    expect(quote.collateralUsed).toHaveLength(1);
    expect(quote.collateralUsed[0]).toMatchObject({
      token: weeth,
      symbol: "WEETH",
      valueExact: usd(7),
    });
    expect(quote.exactMaximum).toEqual(usd(5.425));
  });

  it("combines stETH and wstETH only after a non-1:1 exact conversion", () => {
    const steth = "0x0000000000000000000000000000000000000011" as const;
    const wsteth = "0x0000000000000000000000000000000000000012" as const;
    const wbtc = "0x0000000000000000000000000000000000000013" as const;
    const group = rawGroup(wsteth, "wstETH", 0, 0.75, 0.8);
    group.sources = [
      { token: steth, symbol: "stETH", convertedBalanceRaw: usd(12).raw },
      { token: wsteth, symbol: "wstETH", convertedBalanceRaw: usd(10).raw },
    ];
    const source: LiveQuoteSnapshot = {
      ...baseSnapshot,
      kind: "aave-like",
      mode: "wallet-estimate",
      existingDebtUsd: 0,
      existingDebtExact: usd(0),
      safetyProfile: "max",
      targetHealthFactor: 1,
      collateral: [],
      rawCollateral: [group, rawGroup(wbtc, "WBTC", 5, 0.7, 0.75)],
    };

    const projected = projectLiveSnapshots([source], [steth, wsteth, wbtc])[0]!;
    expect(projected.kind === "aave-like" && projected.collateral).toHaveLength(
      2,
    );
    expect(
      projected.kind === "aave-like"
        ? projected.collateral.map((item) => item.valueExact.raw)
        : [],
    ).toEqual([usd(22).raw, usd(5).raw]);
  });

  it("projects a new collateral selection without changing the source snapshot", () => {
    const weth = "0x0000000000000000000000000000000000000001" as const;
    const wbtc = "0x0000000000000000000000000000000000000002" as const;
    const source: LiveQuoteSnapshot = {
      ...baseSnapshot,
      kind: "aave-like",
      mode: "wallet-estimate",
      existingDebtUsd: 0,
      existingDebtExact: usd(0),
      safetyProfile: "balanced",
      targetHealthFactor: 1.35,
      collateral: [
        liveCollateral(weth, "WETH", 6_000, 0.8, 0.83),
        liveCollateral(wbtc, "WBTC", 12_000, 0.7, 0.77),
      ],
      rawCollateral: [
        rawGroup(weth, "WETH", 6_000, 0.8, 0.83),
        rawGroup(wbtc, "WBTC", 12_000, 0.7, 0.77),
      ],
      assetEvaluations: [
        {
          token: weth,
          symbol: "WETH",
          selectionStatus: "selected",
          eligibilityStatus: "included",
          reasonCodes: ["INCLUDED"],
          reason: "Included in this protocol estimate.",
          ltv: 0.8,
          liquidationThreshold: 0.83,
          contributionUsd: 6_000,
        },
        {
          token: wbtc,
          symbol: "WBTC",
          selectionStatus: "selected",
          eligibilityStatus: "included",
          reasonCodes: ["INCLUDED"],
          reason: "Included in this protocol estimate.",
          ltv: 0.7,
          liquidationThreshold: 0.77,
          contributionUsd: 12_000,
        },
      ],
    };

    const [projected] = projectLiveSnapshots([source], [weth]);
    const quote = quoteLiveSnapshots({ snapshots: [projected!] })[0]!;

    expect(projected?.kind === "aave-like" && projected.collateral).toEqual([
      expect.objectContaining({ token: weth, valueUsd: 6_000 }),
    ]);
    expect(quote.theoreticalBorrowUsd).toBe(4_800);
    expect(quote.assetEvaluations).toContainEqual(
      expect.objectContaining({
        token: wbtc,
        selectionStatus: "not-selected",
        eligibilityStatus: "supported",
        reasonCodes: ["SUPPORTED_NOT_SELECTED"],
      }),
    );
    expect(source.kind === "aave-like" ? source.collateral : []).toHaveLength(
      2,
    );
  });

  it("quotes Aave-like source snapshots using health-factor math", () => {
    const quote = quoteAaveLikeLiveSnapshot({
      ...baseSnapshot,
      safetyProfile: "balanced",
      targetHealthFactor: 1.35,
      rawCollateral: [],
      collateral: [
        liveCollateral(
          "0x0000000000000000000000000000000000000001",
          "WETH",
          100_000,
          0.8,
          0.83,
        ),
        liveCollateral(
          "0x0000000000000000000000000000000000000002",
          "wstETH",
          40_000,
          0.77,
          0.81,
        ),
      ],
    });

    expect(quote.protocolId).toBe("aave-v3");
    expect(quote.theoreticalBorrowUsd).toBe(85_800);
    expect(quote.safeBorrowUsd).toBe(60_481.48);
    expect(quote.healthFactor).toBe(4.616);
    expect(quote.liquidationRisk).toBe("health-factor");
    expect(quote.confidence).toBe("high");
    expect(quote.provenance[0]).toMatchObject({
      sourceType: "official-api",
      blockNumber: "23123456",
    });
  });

  it("does not round sub-dollar Aave capacity above its target ratio", () => {
    const quote = quoteAaveLikeLiveSnapshot({
      ...baseSnapshot,
      mode: "wallet-estimate",
      existingDebtUsd: 0,
      existingDebtExact: usd(0),
      safetyProfile: "balanced",
      targetHealthFactor: 1.35,
      rawCollateral: [],
      collateral: [
        liveCollateral(
          "0x0000000000000000000000000000000000000001",
          "WETH",
          0.08,
          0.8,
          0.825,
        ),
      ],
    });

    expect(quote.safeBorrowUsd).toBeCloseTo(0.0488889, 6);
    expect(
      (quote.collateralUsed[0]!.valueUsd *
        quote.collateralUsed[0]!.liquidationThreshold!) /
        quote.safeBorrowUsd!,
    ).toBeCloseTo(1.35, 5);
  });

  it("aggregates independent Morpho markets without reusing collateral", () => {
    const quote = quoteMorphoLiveSnapshot({
      ...baseSnapshot,
      protocolId: "morpho-blue",
      protocolLabel: "Morpho Blue",
      familyId: "morpho-blue",
      familyLabel: "Morpho Blue",
      source: "Morpho official GraphQL test snapshot",
      safetyProfile: "balanced",
      existingDebtUsd: 0,
      existingDebtExact: usd(0),
      markets: [
        morphoMarket(
          "0x0000000000000000000000000000000000000001",
          "WETH",
          50_000,
          0.86,
          "WETH-USDC-86",
          20_000,
          0.041,
        ),
        morphoMarket(
          "0x0000000000000000000000000000000000000002",
          "WBTC",
          70_000,
          0.77,
          "WBTC-USDC-77",
          500_000,
          0.052,
        ),
      ],
    });

    expect(quote.safeBorrowUsd).toBe(62_815);
    expect(quote.exactMaximum).toEqual(usd(73_900));
    expect(quote.collateralUsed.map((item) => item.marketId)).toEqual([
      "WBTC-USDC-77",
      "WETH-USDC-86",
    ]);
    expect(quote.annualRate).toMatchObject({
      convention: "apy",
      rateType: "variable",
      sourceId: "morpho-blue:weighted-current-route",
    });
    expect(quote.annualRate?.value).toBeGreaterThan(0.04);
    expect(quote.annualRate?.value).toBeLessThan(0.0521);
    expect(quote.indicativeApr).toBeNull();
    expect(quote.availableLiquidityUsd).toBe(1_000_000);
    expect(quote.assumptions).toContain(
      "Aggregate capacity allocates each collateral family once across independent markets.",
    );
    expect(quote.liquidationRisk).toBe("ltv-threshold");
  });

  it("allocates one collateral balance across several LLTVs only once", () => {
    const token = "0x0000000000000000000000000000000000000001";
    const route = buildMorphoBorrowRoute(
      [
        isolatedMarket("high-lltv", token, 100, 0.9, 30, 0.05),
        isolatedMarket("lower-lltv", token, 100, 0.8, 100, 0.04),
      ],
      1_000n * 10n ** 6n,
      "capacity",
    );

    expect(route.legs.map((leg) => leg.marketId)).toEqual([
      "lower-lltv",
      "high-lltv",
    ]);
    expect(
      route.legs.reduce(
        (sum, leg) => sum + BigInt(leg.collateralAssigned.raw),
        0n,
      ),
    ).toBeLessThanOrEqual(100n * 10n ** 6n);
    expect(
      route.legs.reduce((sum, leg) => sum + BigInt(leg.borrowAmount.raw), 0n),
    ).toBe(83_333_332n);
    expect(route.legs[0]!.healthFactor).toBeCloseTo(
      route.legs[1]!.healthFactor!,
      6,
    );
  });

  it("maximizes the common health factor before considering rate", () => {
    const token = "0x0000000000000000000000000000000000000001";
    const route = buildMorphoBorrowRoute(
      [
        isolatedMarket("cheap-low-lltv", token, 100, 0.5, 100, 0.01),
        isolatedMarket("costly-high-lltv", token, 100, 0.9, 100, 0.1),
      ],
      80n * 10n ** 6n,
    );

    expect(route.feasible).toBe(true);
    expect(route.legs).toHaveLength(1);
    expect(route.legs[0]?.marketId).toBe("costly-high-lltv");
    expect(
      route.legs.reduce((sum, leg) => sum + BigInt(leg.borrowAmount.raw), 0n),
    ).toBe(80n * 10n ** 6n);
    expect(route.weightedCurrentApy).toBeCloseTo(0.1, 8);
    expect(route.worstHealthFactor).toBeCloseTo(1.125, 6);
  });

  it("does not max out tiny cheap markets and drag the whole route to HF 1", () => {
    const route = buildMorphoBorrowRoute(
      [
        isolatedMarket(
          "large-route",
          "0x0000000000000000000000000000000000000001",
          15_500,
          0.86,
          50_000_000,
          0.04,
        ),
        isolatedMarket(
          "tiny-cheap-route",
          "0x0000000000000000000000000000000000000002",
          6.5,
          0.86,
          5.59,
          0.001,
        ),
      ],
      6_667_795_000n,
    );

    expect(route.feasible).toBe(true);
    expect(route.legs).toHaveLength(2);
    expect(route.legs[0]!.healthFactor).toBeCloseTo(
      route.legs[1]!.healthFactor!,
      6,
    );
    expect(route.worstHealthFactor).toBeCloseTo(2, 3);
    expect(BigInt(route.legs[1]!.borrowAmount.raw)).toBeLessThan(5_590_000n);
  });

  it("assigns collateral so every active Morpho route has the same health factor", () => {
    const route = buildMorphoBorrowRoute(
      [
        isolatedMarket(
          "small-cheap-route",
          "0x0000000000000000000000000000000000000001",
          100,
          0.9,
          30,
          0.01,
        ),
        isolatedMarket(
          "large-costly-route",
          "0x0000000000000000000000000000000000000002",
          200,
          0.8,
          160,
          0.05,
        ),
      ],
      100n * 10n ** 6n,
    );

    expect(route.feasible).toBe(true);
    expect(route.legs.map((leg) => leg.marketId)).toEqual([
      "large-costly-route",
      "small-cheap-route",
    ]);
    expect(route.legs.map((leg) => BigInt(leg.borrowAmount.raw))).toEqual([
      70n * 10n ** 6n,
      30n * 10n ** 6n,
    ]);
    expect(route.legs[0]!.healthFactor).toBeCloseTo(
      route.legs[1]!.healthFactor!,
      6,
    );
    expect(route.worstHealthFactor).toBeCloseTo(16 / 7, 6);
  });

  it("equalizes an 18-decimal collateral route without unit-by-unit rounding work", () => {
    const route = buildMorphoBorrowRoute(
      [
        {
          marketId: "weth-usdc",
          collateralToken: "0x0000000000000000000000000000000000000001",
          collateralSymbol: "WETH",
          collateralAvailable: {
            raw: "1000000000000000000",
            decimals: 18,
          },
          oraclePrice: {
            numerator: "3000000000",
            denominator: "1000000000000000000",
          },
          lltv: { numerator: "8", denominator: "10" },
          availableLiquidity: usd(10_000),
          currentBorrowApy: { numerator: "4", denominator: "100" },
        },
      ],
      1_000n * 10n ** 6n,
    );

    expect(route.feasible).toBe(true);
    expect(route.legs).toHaveLength(1);
    expect(route.legs[0]!.collateralAssigned.raw).toBe("1000000000000000000");
    expect(route.legs[0]!.healthFactor).toBeCloseTo(2.4, 6);
  });

  it("quotes Compound III source snapshots from borrow and liquidation factors", () => {
    const quote = quoteCompoundLiveSnapshot({
      ...baseSnapshot,
      protocolId: "compound-iii",
      protocolLabel: "Compound III",
      familyId: "compound-iii",
      familyLabel: "Compound III",
      source: "Compound Comet on-chain test snapshot",
      sourceType: "on-chain",
      safetyProfile: "conservative",
      existingDebtUsd: 15_000,
      existingDebtExact: usd(15_000),
      rawCollateral: [],
      collateral: [
        compoundCollateral(
          "0x0000000000000000000000000000000000000001",
          "WETH",
          80_000,
          0.825,
          0.9,
        ),
      ],
    });

    expect(quote.theoreticalBorrowUsd).toBe(51_000);
    expect(quote.safeBorrowUsd).toBe(36_720);
    expect(quote.healthFactor).toBe(4.8);
    expect(quote.collateralUsed[0]).toMatchObject({
      ltv: 0.825,
      liquidationThreshold: 0.9,
    });
  });

  it("makes a Compound path unavailable when even its maximum debt is below baseBorrowMin", () => {
    const quote = quoteCompoundLiveSnapshot({
      ...baseSnapshot,
      protocolId: "compound-iii",
      protocolLabel: "Compound III",
      familyId: "compound-iii",
      familyLabel: "Compound III",
      safetyProfile: "balanced",
      existingDebtUsd: 0,
      existingDebtExact: usd(0),
      minimumBorrowUsd: 1_000,
      minimumBorrowExact: usd(1_000),
      rawCollateral: [],
      collateral: [
        compoundCollateral(
          "0x0000000000000000000000000000000000000001",
          "WETH",
          500,
          0.825,
          0.895,
        ),
      ],
    });

    expect(quote.safeBorrowUsd).toBe(0);
    expect(quote.warnings.join(" ")).toContain("minimum borrow");
  });

  it("quotes, filters, and sorts mixed live snapshots for SDK-compatible orchestration", () => {
    const snapshots: LiveQuoteSnapshot[] = [
      {
        ...baseSnapshot,
        kind: "aave-like",
        protocolId: "aave-v3",
        protocolLabel: "Aave v3",
        familyId: "aave",
        familyLabel: "Aave",
        safetyProfile: "balanced",
        targetHealthFactor: 1.35,
        rawCollateral: [],
        collateral: [
          liveCollateral(
            "0x0000000000000000000000000000000000000001",
            "WETH",
            100_000,
            0.8,
            0.83,
          ),
        ],
      },
      {
        ...baseSnapshot,
        kind: "aave-like",
        protocolId: "aave-v4",
        protocolLabel: "Aave v4",
        familyId: "aave",
        familyLabel: "Aave",
        safetyProfile: "balanced",
        targetHealthFactor: 1.38,
        rawCollateral: [],
        collateral: [
          liveCollateral(
            "0x0000000000000000000000000000000000000001",
            "WETH",
            120_000,
            0.79,
            0.825,
          ),
        ],
      },
      {
        ...baseSnapshot,
        kind: "compound",
        protocolId: "compound-iii",
        protocolLabel: "Compound III",
        familyId: "compound-iii",
        familyLabel: "Compound III",
        safetyProfile: "balanced",
        existingDebtUsd: 0,
        existingDebtExact: usd(0),
        rawCollateral: [],
        collateral: [
          compoundCollateral(
            "0x0000000000000000000000000000000000000002",
            "WBTC",
            80_000,
            0.75,
            0.85,
          ),
        ],
      },
    ];

    const allQuotes = quoteLiveSnapshots({ snapshots });
    const aaveOnly = quoteLiveSnapshots({
      snapshots,
      includeProtocols: ["aave"],
    });
    const compoundOnly = quoteLiveSnapshots({
      snapshots,
      includeProtocols: ["compound-iii"],
    });

    expect(allQuotes.map((quote) => quote.protocolId)).toEqual([
      "aave-v4",
      "compound-iii",
      "aave-v3",
    ]);
    expect(allQuotes.map((quote) => quote.safeBorrowUsd)).toEqual([
      46_739.13, 51_000, 36_481.48,
    ]);
    expect(aaveOnly.map((quote) => quote.protocolId)).toEqual([
      "aave-v4",
      "aave-v3",
    ]);
    expect(compoundOnly.map((quote) => quote.protocolId)).toEqual([
      "compound-iii",
    ]);
  });
});

function isolatedMarket(
  marketId: string,
  collateralToken: `0x${string}`,
  collateralUsd: number,
  lltv: number,
  liquidityUsd: number,
  apy: number,
): IsolatedMarketCapacity {
  return {
    marketId,
    collateralToken,
    collateralSymbol: "TEST",
    collateralAvailable: usd(collateralUsd),
    oraclePrice: { numerator: "1", denominator: "1" },
    lltv: ratio(lltv),
    availableLiquidity: usd(liquidityUsd),
    currentBorrowApy: ratio(apy),
  };
}
