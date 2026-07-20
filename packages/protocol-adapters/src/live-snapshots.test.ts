import { describe, expect, it } from "vitest";
import {
  quoteAaveLikeLiveSnapshot,
  quoteCompoundLiveSnapshot,
  quoteLiveSnapshots,
  quoteMorphoLiveSnapshot,
  type LiveConfidencePenalties,
  type LiveQuoteSnapshot,
  type LiveProtocolSnapshot,
} from "./live-snapshots.js";

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

describe("live protocol snapshot quote builders", () => {
  it("quotes Aave-like source snapshots using health-factor math", () => {
    const quote = quoteAaveLikeLiveSnapshot({
      ...baseSnapshot,
      safetyProfile: "balanced",
      targetHealthFactor: 1.35,
      collateral: [
        {
          token: "0x0000000000000000000000000000000000000001",
          symbol: "WETH",
          valueUsd: 100_000,
          ltv: 0.8,
          liquidationThreshold: 0.83,
        },
        {
          token: "0x0000000000000000000000000000000000000002",
          symbol: "wstETH",
          valueUsd: 40_000,
          ltv: 0.77,
          liquidationThreshold: 0.81,
        },
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

  it("selects the highest safe borrow Morpho isolated market snapshot", () => {
    const quote = quoteMorphoLiveSnapshot({
      ...baseSnapshot,
      protocolId: "morpho-blue",
      protocolLabel: "Morpho Blue",
      familyId: "morpho-blue",
      familyLabel: "Morpho Blue",
      source: "Morpho official GraphQL test snapshot",
      safetyProfile: "balanced",
      existingDebtUsd: 10_000,
      markets: [
        {
          token: "0x0000000000000000000000000000000000000001",
          symbol: "WETH",
          valueUsd: 50_000,
          lltv: 0.86,
          marketId: "WETH-USDC-86",
          availableLiquidityUsd: 20_000,
          borrowApy: 0.041,
        },
        {
          token: "0x0000000000000000000000000000000000000002",
          symbol: "WBTC",
          valueUsd: 70_000,
          lltv: 0.77,
          marketId: "WBTC-USDC-77",
          availableLiquidityUsd: 500_000,
          borrowApy: 0.052,
        },
      ],
    });

    expect(quote.safeBorrowUsd).toBe(37_315);
    expect(quote.collateralUsed[0]?.marketId).toBe("WBTC-USDC-77");
    expect(quote.annualRate).toEqual({
      value: 0.052,
      convention: "apy",
      rateType: "variable",
      sourceId: "morpho-blue:WBTC-USDC-77",
    });
    expect(quote.indicativeApr).toBeNull();
    expect(quote.availableLiquidityUsd).toBe(500_000);
    expect(quote.assumptions).toContain(
      "Selected isolated market WBTC-USDC-77.",
    );
    expect(quote.liquidationRisk).toBe("ltv-threshold");
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
      collateral: [
        {
          token: "0x0000000000000000000000000000000000000001",
          symbol: "WETH",
          valueUsd: 80_000,
          borrowCollateralFactor: 0.825,
          liquidateCollateralFactor: 0.9,
        },
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
        collateral: [
          {
            token: "0x0000000000000000000000000000000000000001",
            symbol: "WETH",
            valueUsd: 100_000,
            ltv: 0.8,
            liquidationThreshold: 0.83,
          },
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
        collateral: [
          {
            token: "0x0000000000000000000000000000000000000001",
            symbol: "WETH",
            valueUsd: 120_000,
            ltv: 0.79,
            liquidationThreshold: 0.825,
          },
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
        collateral: [
          {
            token: "0x0000000000000000000000000000000000000002",
            symbol: "WBTC",
            valueUsd: 80_000,
            borrowCollateralFactor: 0.75,
            liquidateCollateralFactor: 0.85,
          },
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
      "compound-iii",
      "aave-v4",
      "aave-v3",
    ]);
    expect(allQuotes.map((quote) => quote.safeBorrowUsd)).toEqual([
      51_000, 46_739.13, 36_481.48,
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
