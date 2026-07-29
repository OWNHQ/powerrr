import type {
  CollateralUsed,
  Confidence,
  OwnRiskMetric,
  ProtocolBorrowQuote,
  RiskLevel,
  ScenarioDefinition,
  ScenarioQuoteResult,
} from "@powerrr/shared-types";

export type AaveLikeCollateralInput = {
  valueUsd: number;
  ltv: number;
  liquidationThreshold: number;
};

export type AaveLikeBorrowInput = {
  collateral: AaveLikeCollateralInput[];
  existingDebtUsd: number;
  availableLiquidityUsd: number;
  targetHealthFactor: number;
  safetyBuffer: number;
};

export type BorrowCapacityResult = {
  theoreticalBorrowUsd: number;
  safeBorrowUsd: number;
  weightedLiquidationValueUsd: number;
  healthFactor: number | null;
};

export type MorphoMarketInput = {
  collateralValueUsd: number;
  lltv: number;
  borrowedUsd: number;
  availableLiquidityUsd: number;
  safetyBuffer: number;
};

export type CompoundInput = {
  collateral: Array<{
    valueUsd: number;
    borrowCollateralFactor: number;
    liquidateCollateralFactor: number;
  }>;
  existingDebtUsd: number;
  availableBaseLiquidityUsd: number;
  safetyBuffer: number;
};

export type OwnCollateralInput = {
  valueUsd: number;
  maxAdvanceRate: number;
  haircut: number;
  family: string;
};

export type OwnCaps = {
  capitalAvailabilityUsd: number;
  maxTicketUsd: number;
  targetConcentrationLimitUsd: number;
};

export function roundUsd(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value !== 0 && Math.abs(value) < 1) {
    return Number(value.toPrecision(6));
  }

  const rounded = Math.round(value * 100) / 100;
  return rounded;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function safetyBufferForProfile(
  profile: "max" | "balanced" | "conservative",
): number {
  if (profile === "max") {
    return 1;
  }

  if (profile === "conservative") {
    return 0.72;
  }

  return 0.85;
}

export function calculateAaveLikeBorrow(
  input: AaveLikeBorrowInput,
): BorrowCapacityResult {
  const theoreticalGross = input.collateral.reduce(
    (sum, item) => sum + item.valueUsd * item.ltv,
    0,
  );
  const weightedLiquidationValueUsd = input.collateral.reduce(
    (sum, item) => sum + item.valueUsd * item.liquidationThreshold,
    0,
  );
  const theoreticalBorrowUsd = Math.max(
    0,
    theoreticalGross - input.existingDebtUsd,
  );
  const safeHeadroomByHealthFactor = Math.max(
    0,
    weightedLiquidationValueUsd / input.targetHealthFactor -
      input.existingDebtUsd,
  );
  const safeBorrowUsd = Math.min(
    theoreticalBorrowUsd * input.safetyBuffer,
    safeHeadroomByHealthFactor,
    input.availableLiquidityUsd,
  );
  const healthFactor =
    input.existingDebtUsd > 0
      ? weightedLiquidationValueUsd / input.existingDebtUsd
      : null;

  return {
    theoreticalBorrowUsd: roundUsd(theoreticalBorrowUsd),
    safeBorrowUsd: roundUsd(safeBorrowUsd),
    weightedLiquidationValueUsd: roundUsd(weightedLiquidationValueUsd),
    healthFactor: healthFactor === null ? null : roundRatio(healthFactor),
  };
}

export function calculateMorphoMarket(
  input: MorphoMarketInput,
): BorrowCapacityResult {
  const theoreticalGross = input.collateralValueUsd * input.lltv;
  const theoreticalBorrowUsd = Math.max(
    0,
    theoreticalGross - input.borrowedUsd,
  );
  const safeBorrowUsd = Math.min(
    theoreticalBorrowUsd * input.safetyBuffer,
    input.availableLiquidityUsd,
  );
  const healthFactor =
    input.borrowedUsd > 0
      ? (input.collateralValueUsd * input.lltv) / input.borrowedUsd
      : null;

  return {
    theoreticalBorrowUsd: roundUsd(theoreticalBorrowUsd),
    safeBorrowUsd: roundUsd(safeBorrowUsd),
    weightedLiquidationValueUsd: roundUsd(
      input.collateralValueUsd * input.lltv,
    ),
    healthFactor: healthFactor === null ? null : roundRatio(healthFactor),
  };
}

export function calculateCompoundBorrow(
  input: CompoundInput,
): BorrowCapacityResult {
  const theoreticalGross = input.collateral.reduce(
    (sum, item) => sum + item.valueUsd * item.borrowCollateralFactor,
    0,
  );
  const liquidationCapacity = input.collateral.reduce(
    (sum, item) => sum + item.valueUsd * item.liquidateCollateralFactor,
    0,
  );
  const theoreticalBorrowUsd = Math.max(
    0,
    theoreticalGross - input.existingDebtUsd,
  );
  const safeBorrowUsd = Math.min(
    theoreticalBorrowUsd * input.safetyBuffer,
    input.availableBaseLiquidityUsd,
  );
  const healthFactor =
    input.existingDebtUsd > 0
      ? liquidationCapacity / input.existingDebtUsd
      : null;

  return {
    theoreticalBorrowUsd: roundUsd(theoreticalBorrowUsd),
    safeBorrowUsd: roundUsd(safeBorrowUsd),
    weightedLiquidationValueUsd: roundUsd(liquidationCapacity),
    healthFactor: healthFactor === null ? null : roundRatio(healthFactor),
  };
}

export function calculateOwnOfferedPrincipal(
  collateral: OwnCollateralInput[],
  caps: OwnCaps,
): {
  advanceableValueUsd: number;
  offeredPrincipalUsd: number;
  concentrationShare: number;
} {
  const familyAdvance = new Map<string, number>();
  let advanceableValueUsd = 0;

  for (const item of collateral) {
    const advance = item.valueUsd * item.maxAdvanceRate * item.haircut;
    advanceableValueUsd += advance;
    familyAdvance.set(
      item.family,
      (familyAdvance.get(item.family) ?? 0) + advance,
    );
  }

  const largestFamilyAdvance = Math.max(0, ...familyAdvance.values());
  const concentrationLimit = Math.min(
    caps.targetConcentrationLimitUsd,
    largestFamilyAdvance || Infinity,
  );
  const offeredPrincipalUsd = Math.min(
    advanceableValueUsd,
    caps.capitalAvailabilityUsd,
    caps.maxTicketUsd,
    concentrationLimit,
  );
  const concentrationShare =
    advanceableValueUsd > 0 ? largestFamilyAdvance / advanceableValueUsd : 0;

  return {
    advanceableValueUsd: roundUsd(advanceableValueUsd),
    offeredPrincipalUsd: roundUsd(
      offeredPrincipalUsd === Infinity ? 0 : offeredPrincipalUsd,
    ),
    concentrationShare: roundRatio(concentrationShare),
  };
}

export function amortizingMonthlyPayment(
  principalUsd: number,
  annualRate: number,
  termMonths: number,
): number {
  if (principalUsd <= 0) {
    return 0;
  }

  const monthlyRate = annualRate / 12;
  if (monthlyRate === 0) {
    return roundUsd(principalUsd / termMonths);
  }

  const growth = (1 + monthlyRate) ** termMonths;
  return roundUsd((principalUsd * monthlyRate * growth) / (growth - 1));
}

export function outstandingBalanceAfterPayments(
  principalUsd: number,
  annualRate: number,
  termMonths: number,
  paymentsMade: number,
): number {
  if (principalUsd <= 0) {
    return 0;
  }

  const boundedPayments = clamp(paymentsMade, 0, termMonths);
  if (boundedPayments >= termMonths) {
    return 0;
  }

  const monthlyRate = annualRate / 12;
  const payment = amortizingMonthlyPayment(
    principalUsd,
    annualRate,
    termMonths,
  );

  if (monthlyRate === 0) {
    return roundUsd(Math.max(0, principalUsd - payment * boundedPayments));
  }

  const balance =
    principalUsd * (1 + monthlyRate) ** boundedPayments -
    payment * (((1 + monthlyRate) ** boundedPayments - 1) / monthlyRate);

  return roundUsd(Math.max(0, balance));
}

export function calculateOwnRiskMetrics(input: {
  collateralValueUsd: number;
  stressedRecoveryValueUsd: number;
  outstandingBalanceUsd: number;
  probabilityOfDefault: number;
  fixedBorrowRate: number;
  internalFundingRate: number;
  concentrationShare: number;
}): OwnRiskMetric[] {
  const stressedCoverage =
    input.outstandingBalanceUsd > 0
      ? input.stressedRecoveryValueUsd / input.outstandingBalanceUsd
      : 0;
  const expectedLoss =
    input.probabilityOfDefault *
    Math.max(0, input.outstandingBalanceUsd - input.stressedRecoveryValueUsd);
  const fundingBasisRisk = input.fixedBorrowRate - input.internalFundingRate;

  return [
    {
      name: "Stressed collateral coverage",
      value: roundRatio(stressedCoverage),
      unit: "ratio",
      explanation:
        "Stressed recovery value divided by scheduled outstanding balance.",
    },
    {
      name: "Expected loss",
      value: roundUsd(expectedLoss),
      unit: "usd",
      explanation:
        "Probability of default multiplied by uncovered exposure at default.",
    },
    {
      name: "Funding basis risk",
      value: roundRatio(fundingBasisRisk),
      unit: "percent",
      explanation: "Fixed borrower APR less internal funding rate.",
    },
    {
      name: "Concentration share",
      value: roundRatio(input.concentrationShare),
      unit: "percent",
      explanation:
        "Largest collateral-family contribution to eligible collateral value.",
    },
  ];
}

export function calculateStressedRecoveryValue(
  collateral: Array<{
    valueUsd: number;
    spotShock: number;
    liquidityRecovery: number;
    legalRecovery: number;
  }>,
): number {
  return roundUsd(
    collateral.reduce(
      (sum, item) =>
        sum +
        item.valueUsd *
          (1 - item.spotShock) *
          item.liquidityRecovery *
          item.legalRecovery,
      0,
    ),
  );
}

export function calculateConfidenceScore(input: {
  sourcePenalty: number;
  stalenessPenalty: number;
  fallbackPenalty: number;
  complexityPenalty: number;
  liquidityPenalty: number;
}): {
  score: number;
  confidence: Confidence;
} {
  const score = clamp(
    100 -
      input.sourcePenalty -
      input.stalenessPenalty -
      input.fallbackPenalty -
      input.complexityPenalty -
      input.liquidityPenalty,
    0,
    100,
  );

  return {
    score,
    confidence: confidenceFromScore(score),
  };
}

export function confidenceFromScore(score: number): Confidence {
  if (score >= 85) {
    return "high";
  }

  if (score >= 65) {
    return "medium";
  }

  return "low";
}

export function riskLevelFromHealthFactor(
  healthFactor: number | null,
): RiskLevel {
  if (healthFactor === null) {
    return "unknown";
  }

  if (healthFactor >= 1.6) {
    return "low";
  }

  if (healthFactor >= 1.2) {
    return "medium";
  }

  return "high";
}

export function riskLevelFromUtilization(
  theoreticalBorrowUsd: number,
  safeBorrowUsd: number,
): RiskLevel {
  if (theoreticalBorrowUsd <= 0) {
    return "low";
  }

  const utilization = safeBorrowUsd / theoreticalBorrowUsd;
  if (utilization <= 0.75) {
    return "low";
  }

  if (utilization <= 0.9) {
    return "medium";
  }

  return "high";
}

export function runScenarioStress(
  quote: ProtocolBorrowQuote,
  scenario: ScenarioDefinition,
): ScenarioQuoteResult {
  const stressedCollateral: CollateralUsed[] = quote.collateralUsed.map(
    (item: CollateralUsed) => {
      const shock =
        scenario.collateralShock[item.symbol] ??
        scenario.collateralShock.default ??
        0;
      return {
        ...item,
        valueUsd: item.valueUsd * (1 - shock),
      };
    },
  );

  const stressedTheoretical = stressedCollateral.reduce(
    (sum, item) => sum + item.valueUsd * (item.ltv ?? 0.5),
    0,
  );
  const stressedLiquidity =
    (quote.availableLiquidityUsd ?? Number.POSITIVE_INFINITY) *
    scenario.liquidityMultiplier;
  const existingDebt = quote.existingDebtUsd ?? 0;
  const protocolSafeBorrowMultiplier = clamp(
    scenario.protocolSafeBorrowMultiplier?.[quote.protocolId] ??
      scenario.protocolSafeBorrowMultiplier?.[quote.familyId] ??
      1,
    0,
    1,
  );
  const stressedSafe =
    quote.safeBorrowUsd === null
      ? null
      : roundUsd(
          Math.max(
            0,
            Math.min(
              stressedTheoretical - existingDebt,
              stressedLiquidity,
              quote.safeBorrowUsd,
            ),
          ) * protocolSafeBorrowMultiplier,
        );
  const stressedLiquidationValue = stressedCollateral.reduce(
    (sum, item) =>
      sum + item.valueUsd * (item.liquidationThreshold ?? item.ltv ?? 0.5),
    0,
  );
  const stressedHealthFactor =
    existingDebt > 0
      ? roundRatio(stressedLiquidationValue / existingDebt)
      : (quote.healthFactor ?? null);
  const score = clamp(
    quote.confidenceScore - scenario.confidencePenalty,
    0,
    100,
  );

  return {
    scenarioId: scenario.id,
    scenarioLabel: scenario.label,
    protocolId: quote.protocolId,
    protocolLabel: quote.protocolLabel,
    baseSafeBorrowUsd: quote.safeBorrowUsd,
    stressedSafeBorrowUsd: stressedSafe,
    baseHealthFactor: quote.healthFactor ?? null,
    stressedHealthFactor,
    confidence: confidenceFromScore(score),
    warnings: [
      `Applied ${scenario.label} using deterministic fixture shocks.`,
      ...quote.warnings,
    ],
  };
}

function roundRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value * 10_000) / 10_000;
}
