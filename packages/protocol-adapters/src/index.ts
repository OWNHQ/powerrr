import {
  CURRENT_FIXTURE_BLOCK,
  deterministicScenarios,
  existingDebtFixtures,
  ownCaps,
  ownTerms,
  protocolFixtures,
  protocolMetadataFixtures,
  tokenFixtures,
  type ProtocolFixture,
  type RiskParameter,
  type TokenSymbol,
} from "@powerrr/fixtures";
import {
  amortizingMonthlyPayment,
  calculateAaveLikeBorrow,
  calculateCompoundBorrow,
  calculateConfidenceScore,
  calculateMorphoMarket,
  calculateOwnOfferedPrincipal,
  calculateOwnRiskMetrics,
  calculateStressedRecoveryValue,
  confidenceFromScore,
  outstandingBalanceAfterPayments,
  riskLevelFromHealthFactor,
  riskLevelFromUtilization,
  roundUsd,
  runScenarioStress,
  safetyBufferForProfile,
} from "@powerrr/math";
import type {
  CollateralUsed,
  Confidence,
  HexAddress,
  OwnRiskResponse,
  PortfolioAsset,
  ProtocolAdapter,
  ProtocolAdapterInput,
  ProtocolBorrowQuote,
  ProtocolMetadata,
  ScenarioId,
  ScenarioQuoteResult,
} from "@powerrr/shared-types";

export {
  AAVE_V3_ETHEREUM,
  SPARKLEND_ETHEREUM,
  loadAaveLikeSnapshot,
  type AaveLikeDeployment,
} from "./aave-like-live-source.js";
export {
  loadCompoundUsdcCometSnapshot,
  COMPOUND_USDC_COMET_MAINNET,
} from "./compound-live-source.js";
export { loadMorphoSnapshot } from "./morpho-live-source.js";
export * from "./live-snapshots.js";

export function getProtocolMetadata(): ProtocolMetadata[] {
  return protocolMetadataFixtures;
}

export function getProtocolAdapters(): ProtocolAdapter[] {
  return [
    createOwnAdapter(),
    createAaveLikeAdapter("aave-v3"),
    createAaveLikeAdapter("aave-v4"),
    createMorphoAdapter(),
    createEulerAdapter(),
    createCompoundAdapter(),
    createAaveLikeAdapter("sparklend"),
  ];
}

export async function quoteAllProtocols(
  input: ProtocolAdapterInput & { includeProtocols?: string[] },
): Promise<ProtocolBorrowQuote[]> {
  const include = input.includeProtocols
    ? new Set(input.includeProtocols)
    : null;
  const adapters = getProtocolAdapters().filter((adapter) => {
    if (!adapter.supports(input.chainId)) {
      return false;
    }

    return (
      include === null ||
      include.has(adapter.id) ||
      include.has(adapter.metadata.familyId)
    );
  });

  const quoteGroups = await Promise.all(
    adapters.map((adapter) => adapter.quote(input)),
  );
  return quoteGroups.flat().sort(sortQuotes);
}

export function runDeterministicScenarios(input: {
  quotes: ProtocolBorrowQuote[];
  scenarioIds?: ScenarioId[];
}): ScenarioQuoteResult[] {
  const selected = input.scenarioIds
    ? deterministicScenarios.filter((scenario) =>
        input.scenarioIds?.includes(scenario.id),
      )
    : deterministicScenarios;

  return selected.flatMap((scenario) =>
    input.quotes.map((quote) => runScenarioStress(quote, scenario)),
  );
}

export function calculateOwnRiskResponse(input: {
  address: HexAddress;
  chainId: number;
  portfolio: PortfolioAsset[];
  requestedPrincipalUsd?: number;
  termMonths?: 12 | 24 | 36;
}): OwnRiskResponse {
  const termMonths = input.termMonths ?? 24;
  const fixedApr = ownTerms[termMonths];
  const ownFixture = fixtureById("own");
  const collateral = getEligibleCollateral(input.portfolio, ownFixture).map(
    (item) => ({
      valueUsd: item.valueUsd,
      maxAdvanceRate: item.parameter.maxAdvanceRate ?? 0,
      haircut: item.parameter.haircut ?? 0,
      family: item.parameter.family ?? item.symbol,
    }),
  );
  const offered = calculateOwnOfferedPrincipal(collateral, ownCaps);
  const requestedPrincipalUsd = input.requestedPrincipalUsd ?? null;
  const principal =
    requestedPrincipalUsd === null
      ? offered.offeredPrincipalUsd
      : Math.min(requestedPrincipalUsd, offered.offeredPrincipalUsd);
  const monthlyPaymentUsd = amortizingMonthlyPayment(
    principal,
    fixedApr,
    termMonths,
  );
  const endingBalanceUsd = outstandingBalanceAfterPayments(
    principal,
    fixedApr,
    termMonths,
    termMonths,
  );
  const stressedRecoveryValueUsd = calculateStressedRecoveryValue(
    collateral.map((item) => ({
      valueUsd: item.valueUsd,
      spotShock: item.family === "USD" ? 0.08 : 0.35,
      liquidityRecovery: item.family === "USD" ? 0.96 : 0.82,
      legalRecovery: 0.86,
    })),
  );
  const metrics = calculateOwnRiskMetrics({
    collateralValueUsd: collateral.reduce(
      (sum, item) => sum + item.valueUsd,
      0,
    ),
    stressedRecoveryValueUsd,
    outstandingBalanceUsd: Math.max(principal, 1),
    probabilityOfDefault: 0.045,
    fixedBorrowRate: fixedApr,
    internalFundingRate: 0.055,
    concentrationShare: offered.concentrationShare,
  });

  return {
    resolvedAddress: input.address,
    termMonths,
    offeredPrincipalUsd: offered.offeredPrincipalUsd,
    requestedPrincipalUsd,
    fixedApr,
    monthlyPaymentUsd,
    endingBalanceUsd,
    metrics,
    assumptions: ownFixture.assumptions,
    warnings:
      principal < (requestedPrincipalUsd ?? 0)
        ? [
            "Requested principal exceeds fixture underwriting capacity and was capped.",
          ]
        : ownFixture.warnings,
  };
}

function createOwnAdapter(): ProtocolAdapter {
  const fixture = fixtureById("own");

  return {
    id: fixture.id,
    label: fixture.label,
    metadata: metadataById(fixture.id),
    supports: (chainId) => chainId === 1,
    quote: async (input) => {
      const collateralItems = getEligibleCollateral(input.portfolio, fixture);
      const ownCollateral = collateralItems.map((item) => ({
        valueUsd: item.valueUsd,
        maxAdvanceRate: item.parameter.maxAdvanceRate ?? 0,
        haircut: item.parameter.haircut ?? 0,
        family: item.parameter.family ?? item.symbol,
      }));
      const offered = calculateOwnOfferedPrincipal(ownCollateral, ownCaps);
      const safeBorrowUsd = roundUsd(
        offered.offeredPrincipalUsd *
          safetyBufferForProfile(input.safetyProfile),
      );
      const confidence = confidenceForFixture(fixture);
      const existingDebtUsd = existingDebtFor(
        input.address,
        fixture.id,
        input.mode,
      );
      const collateralUsed = collateralItems.map((item) =>
        collateralUsedFor(item, {
          ltv: item.parameter.maxAdvanceRate ?? item.parameter.ltv,
          liquidationThreshold: null,
        }),
      );

      return [
        buildQuote({
          fixture,
          input,
          theoreticalBorrowUsd: Math.max(
            0,
            offered.offeredPrincipalUsd - existingDebtUsd,
          ),
          safeBorrowUsd: Math.max(0, safeBorrowUsd - existingDebtUsd),
          existingDebtUsd,
          targetBorrowAsset: "USD",
          rateType: "fixed",
          indicativeApr: ownTerms[24],
          termMonths: 24,
          liquidationRisk: "none-assumed-own",
          collateralUsed,
          healthFactor: null,
          confidence,
          riskLevel: riskLevelFromUtilization(
            offered.offeredPrincipalUsd,
            safeBorrowUsd,
          ),
          assumptions: [
            ...fixture.assumptions,
            "Public OWN quote uses the 24-month fixture pricing curve.",
          ],
          warnings: fixture.warnings,
        }),
      ];
    },
  };
}

function createAaveLikeAdapter(
  id: "aave-v3" | "aave-v4" | "sparklend",
): ProtocolAdapter {
  const fixture = fixtureById(id);

  return {
    id: fixture.id,
    label: fixture.label,
    metadata: metadataById(fixture.id),
    supports: (chainId) => chainId === 1,
    quote: async (input) => {
      const collateralItems = getEligibleCollateral(input.portfolio, fixture);
      const existingDebtUsd = existingDebtFor(
        input.address,
        fixture.id,
        input.mode,
      );
      const capacity = calculateAaveLikeBorrow({
        collateral: collateralItems.map((item) => ({
          valueUsd: item.valueUsd,
          ltv: item.parameter.ltv,
          liquidationThreshold: item.parameter.liquidationThreshold,
        })),
        existingDebtUsd,
        availableLiquidityUsd: fixture.availableLiquidityUsd,
        targetHealthFactor: fixture.targetHealthFactor,
        safetyBuffer: safetyBufferForProfile(input.safetyProfile),
      });
      const confidence = confidenceForFixture(fixture, {
        liquidityPenalty:
          capacity.theoreticalBorrowUsd > fixture.availableLiquidityUsd ? 8 : 0,
      });

      return [
        buildQuote({
          fixture,
          input,
          theoreticalBorrowUsd: capacity.theoreticalBorrowUsd,
          safeBorrowUsd: capacity.safeBorrowUsd,
          existingDebtUsd,
          targetBorrowAsset: firstTarget(input.targetBorrowAssets),
          rateType: "variable",
          indicativeApr: fixture.indicativeApr,
          liquidationRisk: "health-factor",
          collateralUsed: collateralItems.map((item) =>
            collateralUsedFor(item),
          ),
          healthFactor: capacity.healthFactor,
          confidence,
          riskLevel: riskLevelFromHealthFactor(capacity.healthFactor),
          assumptions: fixture.assumptions,
          warnings: fixture.warnings,
        }),
      ];
    },
  };
}

function createMorphoAdapter(): ProtocolAdapter {
  const fixture = fixtureById("morpho-blue");

  return {
    id: fixture.id,
    label: fixture.label,
    metadata: metadataById(fixture.id),
    supports: (chainId) => chainId === 1,
    quote: async (input) => {
      const existingDebtUsd = existingDebtFor(
        input.address,
        fixture.id,
        input.mode,
      );
      const collateralItems = getEligibleCollateral(input.portfolio, fixture);
      const perMarket = collateralItems.map((item) => {
        const capacity = calculateMorphoMarket({
          collateralValueUsd: item.valueUsd,
          lltv: item.parameter.ltv,
          borrowedUsd: existingDebtUsd,
          availableLiquidityUsd: fixture.availableLiquidityUsd,
          safetyBuffer: safetyBufferForProfile(input.safetyProfile),
        });

        return { item, capacity };
      });
      const best = perMarket.sort(
        (a, b) => b.capacity.safeBorrowUsd - a.capacity.safeBorrowUsd,
      )[0];
      const confidence = confidenceForFixture(fixture);

      if (!best) {
        return [
          buildQuote({
            fixture,
            input,
            theoreticalBorrowUsd: 0,
            safeBorrowUsd: 0,
            existingDebtUsd,
            targetBorrowAsset: firstTarget(input.targetBorrowAssets),
            rateType: "variable",
            indicativeApr: fixture.indicativeApr,
            liquidationRisk: "ltv-threshold",
            collateralUsed: [],
            healthFactor: null,
            confidence,
            riskLevel: "low",
            assumptions: fixture.assumptions,
            warnings: [
              "No fixture collateral maps to a supported Morpho isolated market.",
            ],
          }),
        ];
      }

      return [
        buildQuote({
          fixture,
          input,
          theoreticalBorrowUsd: best.capacity.theoreticalBorrowUsd,
          safeBorrowUsd: best.capacity.safeBorrowUsd,
          existingDebtUsd,
          targetBorrowAsset: firstTarget(input.targetBorrowAssets),
          rateType: "variable",
          indicativeApr: fixture.indicativeApr,
          liquidationRisk: "ltv-threshold",
          collateralUsed: [collateralUsedFor(best.item)],
          healthFactor: best.capacity.healthFactor,
          confidence,
          riskLevel: riskLevelFromHealthFactor(best.capacity.healthFactor),
          assumptions: [
            ...fixture.assumptions,
            `Selected isolated market ${best.item.parameter.marketId ?? best.item.symbol}.`,
          ],
          warnings: fixture.warnings,
        }),
      ];
    },
  };
}

function createEulerAdapter(): ProtocolAdapter {
  const fixture = fixtureById("euler-v2");

  return {
    id: fixture.id,
    label: fixture.label,
    metadata: metadataById(fixture.id),
    supports: (chainId) => chainId === 1,
    quote: async (input) => {
      const collateralItems = getEligibleCollateral(input.portfolio, fixture);
      const existingDebtUsd = existingDebtFor(
        input.address,
        fixture.id,
        input.mode,
      );
      const capacity = calculateAaveLikeBorrow({
        collateral: collateralItems.map((item) => ({
          valueUsd: item.valueUsd,
          ltv: item.parameter.ltv,
          liquidationThreshold: item.parameter.liquidationThreshold,
        })),
        existingDebtUsd,
        availableLiquidityUsd: fixture.availableLiquidityUsd,
        targetHealthFactor: fixture.targetHealthFactor,
        safetyBuffer: safetyBufferForProfile(input.safetyProfile),
      });
      const confidence = confidenceForFixture(fixture);

      return [
        buildQuote({
          fixture,
          input,
          theoreticalBorrowUsd: capacity.theoreticalBorrowUsd,
          safeBorrowUsd: capacity.safeBorrowUsd,
          existingDebtUsd,
          targetBorrowAsset: firstTarget(input.targetBorrowAssets),
          rateType: "variable",
          indicativeApr: fixture.indicativeApr,
          liquidationRisk: "vault-specific",
          collateralUsed: collateralItems.map((item) =>
            collateralUsedFor(item),
          ),
          healthFactor: capacity.healthFactor,
          confidence,
          riskLevel: riskLevelFromHealthFactor(capacity.healthFactor),
          assumptions: fixture.assumptions,
          warnings: fixture.warnings,
        }),
      ];
    },
  };
}

function createCompoundAdapter(): ProtocolAdapter {
  const fixture = fixtureById("compound-iii");

  return {
    id: fixture.id,
    label: fixture.label,
    metadata: metadataById(fixture.id),
    supports: (chainId) => chainId === 1,
    quote: async (input) => {
      const collateralItems = getEligibleCollateral(input.portfolio, fixture);
      const existingDebtUsd = existingDebtFor(
        input.address,
        fixture.id,
        input.mode,
      );
      const capacity = calculateCompoundBorrow({
        collateral: collateralItems.map((item) => ({
          valueUsd: item.valueUsd,
          borrowCollateralFactor:
            item.parameter.borrowCollateralFactor ?? item.parameter.ltv,
          liquidateCollateralFactor:
            item.parameter.liquidateCollateralFactor ??
            item.parameter.liquidationThreshold,
        })),
        existingDebtUsd,
        availableBaseLiquidityUsd: fixture.availableLiquidityUsd,
        safetyBuffer: safetyBufferForProfile(input.safetyProfile),
      });
      const confidence = confidenceForFixture(fixture, {
        liquidityPenalty:
          capacity.theoreticalBorrowUsd > fixture.availableLiquidityUsd ? 6 : 0,
      });

      return [
        buildQuote({
          fixture,
          input,
          theoreticalBorrowUsd: capacity.theoreticalBorrowUsd,
          safeBorrowUsd: capacity.safeBorrowUsd,
          existingDebtUsd,
          targetBorrowAsset: firstTarget(input.targetBorrowAssets),
          rateType: "variable",
          indicativeApr: fixture.indicativeApr,
          liquidationRisk: "ltv-threshold",
          collateralUsed: collateralItems.map((item) =>
            collateralUsedFor(item, {
              ltv: item.parameter.borrowCollateralFactor ?? item.parameter.ltv,
              liquidationThreshold:
                item.parameter.liquidateCollateralFactor ??
                item.parameter.liquidationThreshold,
            }),
          ),
          healthFactor: capacity.healthFactor,
          confidence,
          riskLevel: riskLevelFromHealthFactor(capacity.healthFactor),
          assumptions: fixture.assumptions,
          warnings: fixture.warnings,
        }),
      ];
    },
  };
}

type EligibleCollateral = {
  asset: PortfolioAsset;
  symbol: TokenSymbol;
  parameter: RiskParameter;
  valueUsd: number;
};

function getEligibleCollateral(
  portfolio: PortfolioAsset[],
  fixture: ProtocolFixture,
): EligibleCollateral[] {
  return portfolio.flatMap((asset) => {
    if (!isTokenSymbol(asset.symbol) || !asset.protocolEligible[fixture.id]) {
      return [];
    }

    const parameter = fixture.collateral[asset.symbol];
    if (!parameter) {
      return [];
    }

    return [
      {
        asset,
        symbol: asset.symbol,
        parameter,
        valueUsd: Number(asset.balance) * parameter.priceUsd,
      },
    ];
  });
}

function collateralUsedFor(
  input: EligibleCollateral,
  override: Partial<Pick<CollateralUsed, "ltv" | "liquidationThreshold">> = {},
): CollateralUsed {
  const base: CollateralUsed = {
    token: input.asset.token,
    symbol: input.asset.symbol,
    valueUsd: roundUsd(input.valueUsd),
    ltv: override.ltv ?? input.parameter.ltv,
    liquidationThreshold:
      override.liquidationThreshold ?? input.parameter.liquidationThreshold,
  };

  return {
    ...base,
    ...(input.parameter.marketId ? { marketId: input.parameter.marketId } : {}),
    ...(input.parameter.vaultId ? { vaultId: input.parameter.vaultId } : {}),
  };
}

function existingDebtFor(
  address: HexAddress,
  protocolId: string,
  mode: "wallet-estimate" | "existing-position",
): number {
  if (mode === "wallet-estimate") {
    return 0;
  }

  return existingDebtFixtures[address]?.[protocolId] ?? 0;
}

function buildQuote(input: {
  fixture: ProtocolFixture;
  input: ProtocolAdapterInput;
  theoreticalBorrowUsd: number | null;
  safeBorrowUsd: number | null;
  existingDebtUsd: number;
  targetBorrowAsset: string;
  rateType: ProtocolBorrowQuote["rateType"];
  indicativeApr: number | null;
  termMonths?: number;
  liquidationRisk: ProtocolBorrowQuote["liquidationRisk"];
  collateralUsed: CollateralUsed[];
  healthFactor: number | null;
  riskLevel: ProtocolBorrowQuote["riskLevel"];
  confidence: { score: number; confidence: Confidence };
  assumptions: string[];
  warnings: string[];
}): ProtocolBorrowQuote {
  return {
    protocolId: input.fixture.id,
    protocolLabel: input.fixture.label,
    familyId: input.fixture.familyId,
    familyLabel: input.fixture.familyLabel,
    chainId: input.input.chainId,
    mode: input.input.mode,
    theoreticalBorrowUsd:
      input.theoreticalBorrowUsd === null
        ? null
        : roundUsd(input.theoreticalBorrowUsd),
    safeBorrowUsd:
      input.safeBorrowUsd === null ? null : roundUsd(input.safeBorrowUsd),
    existingDebtUsd: roundUsd(input.existingDebtUsd),
    availableLiquidityUsd: input.fixture.availableLiquidityUsd,
    targetBorrowAsset: input.targetBorrowAsset,
    rateType: input.rateType,
    indicativeApr: input.indicativeApr,
    annualRate:
      input.indicativeApr === null
        ? null
        : {
            value: input.indicativeApr,
            convention: "apr",
            rateType: input.rateType,
            sourceId: `${input.fixture.id}:fixture-rate`,
          },
    ...(input.termMonths ? { termMonths: input.termMonths } : {}),
    liquidationRisk: input.liquidationRisk,
    collateralUsed: input.collateralUsed,
    healthFactor: input.healthFactor,
    riskLevel: input.riskLevel,
    confidence: input.confidence.confidence,
    confidenceScore: input.confidence.score,
    stale: input.fixture.freshnessSeconds > 60,
    timestamp: (input.input.now ?? new Date()).toISOString(),
    assumptions: input.assumptions,
    warnings: input.warnings,
    provenance: [
      {
        source: input.fixture.source,
        sourceType: input.fixture.sourceType,
        freshnessSeconds: input.fixture.freshnessSeconds,
        freshnessStatus:
          input.fixture.freshnessSeconds > 60 ? "stale" : "fresh",
        fetchedAt: (input.input.now ?? new Date()).toISOString(),
        blockNumber: input.input.asOfBlock ?? CURRENT_FIXTURE_BLOCK,
      },
    ],
  };
}

function confidenceForFixture(
  fixture: ProtocolFixture,
  override: Partial<ProtocolFixture["confidencePenalties"]> = {},
): { score: number; confidence: Confidence } {
  const penalties = {
    ...fixture.confidencePenalties,
    ...override,
  };

  return calculateConfidenceScore(penalties);
}

function metadataById(id: string): ProtocolMetadata {
  const metadata = protocolMetadataFixtures.find((item) => item.id === id);
  if (!metadata) {
    throw new Error(`Missing protocol metadata for ${id}`);
  }

  return metadata;
}

function fixtureById(id: keyof typeof protocolFixtures): ProtocolFixture {
  const fixture = protocolFixtures[id];
  if (!fixture) {
    throw new Error(`Missing protocol fixture for ${id}`);
  }

  return fixture;
}

function firstTarget(targetBorrowAssets: string[]): string {
  return targetBorrowAssets[0] ?? "USDC";
}

function sortQuotes(a: ProtocolBorrowQuote, b: ProtocolBorrowQuote): number {
  const safeA = a.safeBorrowUsd ?? -1;
  const safeB = b.safeBorrowUsd ?? -1;

  if (safeA !== safeB) {
    return safeB - safeA;
  }

  return b.confidenceScore - a.confidenceScore;
}

function isTokenSymbol(value: string): value is TokenSymbol {
  return value in tokenFixtures;
}

export function applyAprShock(
  apr: number | null | undefined,
  shockBps: number,
): number | null {
  if (apr === null || apr === undefined) {
    return null;
  }

  return apr + shockBps / 10_000;
}

export function scenarioConfidence(
  baseScore: number,
  penalty: number,
): Confidence {
  return confidenceFromScore(Math.max(0, baseScore - penalty));
}

export * from "./live-snapshots.js";
export * from "./compound-live-source.js";
