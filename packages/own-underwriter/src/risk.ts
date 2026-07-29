import type {
  BorrowerRiskAssessment,
  BorrowerRiskAssessmentRequest,
  BorrowerRiskBand,
  BorrowerRiskScenarioRequest,
  BorrowerRiskScenarioResponse,
  BorrowerScenarioId,
  DecisionReason,
  EvidenceStatus,
  RiskCollateral,
  RiskPolicy,
} from "@powerrr/shared-types";

export const PROVISIONAL_RISK_POLICY: RiskPolicy = {
  version: "own-risk-2026-07-15",
  effectiveAt: "2026-07-15T00:00:00.000Z",
  status: "provisional",
  methodology: "transparent-scorecard-pd-lgd-ead",
  maxTotalDebtServiceRatio: 0.36,
  minimumMonthlyResidualIncomeUsd: 1_000,
  minimumCureMonths: 3,
  rateStressBps: 300,
  incomeStress: 0.25,
  collateralAdvanceRateFloor: 0.15,
  collateralAdvanceRateCeiling: 0.95,
  maximumTermMonths: 120,
  supportedCollateral: ["ETH", "WETH", "BTC", "WBTC", "SOL"],
  supportedCreditTokens: ["USD", "USDC", "DAI", "USDS"],
};

export type AssessBorrowerRiskOptions = {
  policy?: RiskPolicy;
  now?: Date;
  assessmentId?: string;
};

type MutableReason = DecisionReason & { score: number };

export function assessBorrowerRisk(
  request: BorrowerRiskAssessmentRequest,
  options: AssessBorrowerRiskOptions = {},
): BorrowerRiskAssessment {
  const policy = options.policy ?? PROVISIONAL_RISK_POLICY;
  if (request.policyVersion && request.policyVersion !== policy.version) {
    throw new Error(`Unknown risk policy version: ${request.policyVersion}`);
  }

  const now = options.now ?? new Date();
  const collateralAsset = request.collateral.asset.toUpperCase();
  const collateralSupported =
    policy.supportedCollateral.includes(collateralAsset);
  const creditToken = request.facility.creditToken.toUpperCase();
  const creditTokenSupported =
    policy.supportedCreditTokens.includes(creditToken);
  const spotValueUsd =
    request.collateral.amount * request.collateral.spotPriceUsd;
  const haircuts = collateralHaircuts(request.collateral, spotValueUsd);
  const liquidationHaircut = clamp(
    haircuts.liquidity +
      haircuts.custody +
      haircuts.oracle +
      haircuts.liquidationDelay,
    0,
    0.75,
  );
  const stressHaircut = clamp(
    haircuts.liquidity +
      haircuts.custody +
      haircuts.oracle +
      haircuts.volatility +
      haircuts.drawdown,
    0,
    0.85,
  );
  const liquidationValueUsd = spotValueUsd * (1 - liquidationHaircut);
  const stressedValueUsd = spotValueUsd * (1 - stressHaircut);
  const effectiveRecoveryValueUsd = Math.min(
    spotValueUsd,
    Math.max(stressedValueUsd * 0.85, request.collateral.hedgeFloorUsd ?? 0),
  );
  const maximumLtv = collateralSupported
    ? collateralAdvanceRate(request.collateral, policy, haircuts)
    : 0;

  const monthlyGrossIncomeUsd =
    request.borrower.financials.annualGrossIncomeUsd / 12;
  const monthlyIncomeForResidual =
    request.borrower.financials.monthlyNetIncomeUsd ??
    monthlyGrossIncomeUsd * 0.7;
  const debtServicePaymentCapacity = Math.max(
    0,
    monthlyGrossIncomeUsd * policy.maxTotalDebtServiceRatio -
      request.borrower.financials.monthlyDebtPaymentsUsd,
  );
  const residualPaymentCapacity = Math.max(
    0,
    monthlyIncomeForResidual -
      request.borrower.financials.monthlyLivingExpensesUsd -
      request.borrower.financials.monthlyDebtPaymentsUsd -
      policy.minimumMonthlyResidualIncomeUsd,
  );
  const affordableMonthlyPaymentUsd = Math.min(
    debtServicePaymentCapacity,
    residualPaymentCapacity,
  );
  const stressedAnnualRate = Math.min(
    1,
    request.facility.annualRate + policy.rateStressBps / 10_000,
  );
  const maxAffordablePrincipalUsd = principalFromPayment(
    affordableMonthlyPaymentUsd,
    stressedAnnualRate,
    request.facility.durationMonths,
  );
  const maxCollateralPrincipalUsd = Math.min(
    spotValueUsd * maximumLtv,
    effectiveRecoveryValueUsd * 0.9,
  );
  const supportedPrincipalUsd = Math.max(
    0,
    Math.min(maxAffordablePrincipalUsd, maxCollateralPrincipalUsd),
  );

  const proposedMonthlyPaymentUsd = monthlyPayment(
    request.facility.requestedPrincipalUsd,
    request.facility.annualRate,
    request.facility.durationMonths,
  );
  const stressedMonthlyPaymentUsd = monthlyPayment(
    request.facility.requestedPrincipalUsd,
    stressedAnnualRate,
    request.facility.durationMonths,
  );
  const totalDebtServiceRatio =
    monthlyGrossIncomeUsd > 0
      ? (request.borrower.financials.monthlyDebtPaymentsUsd +
          stressedMonthlyPaymentUsd) /
        monthlyGrossIncomeUsd
      : 99;
  const monthlyResidualIncomeUsd =
    monthlyIncomeForResidual -
    request.borrower.financials.monthlyLivingExpensesUsd -
    request.borrower.financials.monthlyDebtPaymentsUsd -
    stressedMonthlyPaymentUsd;
  const requestedLtv = ratio(
    request.facility.requestedPrincipalUsd,
    spotValueUsd,
  );
  const stressedLtv = ratio(
    request.facility.requestedPrincipalUsd,
    stressedValueUsd,
  );
  const exposureAtDefaultUsd = request.facility.requestedPrincipalUsd * 1.03;
  const lossGivenDefault = clamp(
    (exposureAtDefaultUsd - effectiveRecoveryValueUsd) /
      Math.max(1, exposureAtDefaultUsd),
    0,
    1,
  );
  const cureSurplusUsd = Math.max(
    0,
    effectiveRecoveryValueUsd - exposureAtDefaultUsd,
  );
  const cureMonths = Math.min(
    24,
    Math.floor(cureSurplusUsd / Math.max(1, stressedMonthlyPaymentUsd)),
  );

  const reasons: MutableReason[] = [];
  let riskScore = 5;
  const addReason = (item: DecisionReason, score: number) => {
    reasons.push({ ...item, score });
    riskScore += score;
  };

  if (!collateralSupported) {
    addReason(
      reason(
        "COLLATERAL_UNSUPPORTED",
        "critical",
        "Collateral is outside policy",
        `${collateralAsset} is not in the active collateral policy.`,
        collateralAsset,
        policy.supportedCollateral.join(", "),
      ),
      60,
    );
  }
  if (!creditTokenSupported) {
    addReason(
      reason(
        "CREDIT_TOKEN_UNSUPPORTED",
        "critical",
        "Credit token is outside policy",
        `${creditToken} is not in the active facility policy.`,
        creditToken,
        policy.supportedCreditTokens.join(", "),
      ),
      45,
    );
  }
  if (request.facility.durationMonths > policy.maximumTermMonths) {
    addReason(
      reason(
        "TERM_OUTSIDE_POLICY",
        "critical",
        "Requested term is too long",
        "The term exceeds the provisional policy maximum.",
        request.facility.durationMonths,
        policy.maximumTermMonths,
      ),
      35,
    );
  }
  scoreEvidence(
    "INCOME",
    request.borrower.financials.incomeEvidence,
    addReason,
  );
  scoreEvidence("CREDIT", request.borrower.credit.creditEvidence, addReason);
  scoreEvidence("MARKET", request.collateral.marketEvidence, addReason);

  if (request.borrower.financials.monthlyNetIncomeUsd === undefined) {
    addReason(
      reason(
        "NET_INCOME_MISSING",
        "warning",
        "Net income needs verification",
        "Residual-income capacity uses a conservative 70% gross-income proxy until monthly net income is supplied.",
        "missing",
        "verified monthly net income",
      ),
      8,
    );
  }

  if (monthlyGrossIncomeUsd <= 0) {
    addReason(
      reason(
        "NO_REPAYMENT_INCOME",
        "critical",
        "No repayment income",
        "The application has no gross income available for an affordability assessment.",
        monthlyGrossIncomeUsd,
        "> 0",
      ),
      60,
    );
  }
  if (
    ["unemployed", "contract", "other"].includes(
      request.borrower.financials.employmentStatus,
    )
  ) {
    addReason(
      reason(
        "INCOME_STABILITY",
        "warning",
        "Income stability needs review",
        "Employment status may make future income less predictable.",
        request.borrower.financials.employmentStatus,
      ),
      10,
    );
  }
  if (totalDebtServiceRatio > policy.maxTotalDebtServiceRatio) {
    addReason(
      reason(
        "DEBT_SERVICE_HIGH",
        "critical",
        "Debt service exceeds policy",
        "Stressed monthly debt service is above the provisional affordability limit.",
        roundRatio(totalDebtServiceRatio),
        policy.maxTotalDebtServiceRatio,
      ),
      25,
    );
  }
  if (monthlyResidualIncomeUsd < policy.minimumMonthlyResidualIncomeUsd) {
    addReason(
      reason(
        "RESIDUAL_INCOME_LOW",
        "critical",
        "Residual income is too low",
        "Income remaining after living expenses, existing debt, and the stressed payment is below policy.",
        roundUsd(monthlyResidualIncomeUsd),
        policy.minimumMonthlyResidualIncomeUsd,
      ),
      25,
    );
  }
  if (request.borrower.credit.missedPayments24m > 0) {
    addReason(
      reason(
        "RECENT_MISSED_PAYMENTS",
        "warning",
        "Recent missed payments",
        "Recent arrears increase borrower repayment risk.",
        request.borrower.credit.missedPayments24m,
        0,
      ),
      Math.min(20, request.borrower.credit.missedPayments24m * 5),
    );
  }
  if (request.borrower.credit.defaultsOrCollections > 0) {
    addReason(
      reason(
        "DEFAULT_HISTORY",
        "critical",
        "Defaults or collections reported",
        "Prior defaults or collections require manual underwriting.",
        request.borrower.credit.defaultsOrCollections,
        0,
      ),
      Math.min(30, request.borrower.credit.defaultsOrCollections * 15),
    );
  }
  if (request.borrower.credit.activeBankruptcy) {
    addReason(
      reason(
        "ACTIVE_BANKRUPTCY",
        "critical",
        "Active bankruptcy reported",
        "The application cannot be treated as within policy without specialist review.",
        true,
        false,
      ),
      45,
    );
  }
  scoreCreditValue(
    request.borrower.credit.creditScore,
    request.borrower.credit.creditScoreScale,
    addReason,
  );
  if (requestedLtv > maximumLtv) {
    addReason(
      reason(
        "LTV_ABOVE_POLICY",
        "critical",
        "Requested LTV is above policy",
        "The requested principal exceeds the collateral-supported advance rate.",
        roundRatio(requestedLtv),
        roundRatio(maximumLtv),
      ),
      25,
    );
  } else if (maximumLtv > 0 && requestedLtv > maximumLtv * 0.85) {
    addReason(
      reason(
        "LTV_NEAR_LIMIT",
        "warning",
        "LTV is close to the limit",
        "A modest collateral move could remove the policy buffer.",
        roundRatio(requestedLtv),
        roundRatio(maximumLtv),
      ),
      10,
    );
  }
  if (cureMonths < policy.minimumCureMonths) {
    addReason(
      reason(
        "CURE_BUFFER_SHORT",
        "critical",
        "Cure buffer is insufficient",
        "Recoverable collateral surplus cannot cover the required number of stressed payments.",
        cureMonths,
        policy.minimumCureMonths,
      ),
      18,
    );
  }
  if (request.collateral.annualVolatility >= 0.8) {
    addReason(
      reason(
        "COLLATERAL_VOLATILITY",
        "warning",
        "Collateral volatility is high",
        "High annualized volatility increases recovery uncertainty.",
        roundRatio(request.collateral.annualVolatility),
        "< 0.80",
      ),
      10,
    );
  }
  if (request.collateral.maxDrawdown365d >= 0.65) {
    addReason(
      reason(
        "COLLATERAL_DRAWDOWN",
        "warning",
        "Historical drawdown is severe",
        "The supplied drawdown estimate indicates material tail risk.",
        roundRatio(request.collateral.maxDrawdown365d),
        "< 0.65",
      ),
      10,
    );
  }

  const dataComplete =
    [
      request.borrower.financials.incomeEvidence,
      request.borrower.credit.creditEvidence,
      request.collateral.marketEvidence,
    ].every((status) => status === "verified") &&
    request.borrower.financials.monthlyNetIncomeUsd !== undefined;
  riskScore = Math.round(clamp(riskScore, 0, 100));
  const riskBand = bandFor(riskScore);
  const hardOutsidePolicy =
    !collateralSupported ||
    !creditTokenSupported ||
    monthlyGrossIncomeUsd <= 0 ||
    request.facility.durationMonths > policy.maximumTermMonths ||
    supportedPrincipalUsd <= 0;
  const needsManualReview =
    !dataComplete ||
    request.borrower.credit.activeBankruptcy ||
    request.borrower.credit.defaultsOrCollections > 0 ||
    cureMonths < policy.minimumCureMonths ||
    riskBand === "high" ||
    riskBand === "very-high";
  const needsCounteroffer =
    request.facility.requestedPrincipalUsd > supportedPrincipalUsd * 1.005;
  const recommendation = hardOutsidePolicy
    ? "outside-policy"
    : needsManualReview
      ? "manual-review"
      : needsCounteroffer
        ? "counteroffer"
        : "within-policy";
  const orderedReasons = [...reasons]
    .sort(
      (a, b) =>
        severityRank(b.severity) - severityRank(a.severity) ||
        b.score - a.score,
    )
    .map(({ score: _score, ...item }) => item);

  return {
    schemaVersion: "2026-07-15",
    assessmentId:
      options.assessmentId ?? `assessment-${now.getTime().toString(36)}`,
    applicationId: request.applicationId ?? null,
    generatedAt: now.toISOString(),
    policy: {
      version: policy.version,
      effectiveAt: policy.effectiveAt,
      status: policy.status,
      methodology: policy.methodology,
    },
    calibrationStatus:
      policy.status === "validated" ? "validated" : "uncalibrated",
    recommendation,
    riskBand,
    riskScore,
    topRisks: orderedReasons.slice(0, 3),
    reasons: orderedReasons,
    affordability: {
      monthlyGrossIncomeUsd: roundUsd(monthlyGrossIncomeUsd),
      monthlyNetIncomeUsd:
        request.borrower.financials.monthlyNetIncomeUsd === undefined
          ? null
          : roundUsd(request.borrower.financials.monthlyNetIncomeUsd),
      proposedMonthlyPaymentUsd: roundUsd(proposedMonthlyPaymentUsd),
      stressedMonthlyPaymentUsd: roundUsd(stressedMonthlyPaymentUsd),
      totalDebtServiceRatio: roundRatio(totalDebtServiceRatio),
      monthlyResidualIncomeUsd: roundUsd(monthlyResidualIncomeUsd),
      maxAffordablePrincipalUsd: roundUsd(maxAffordablePrincipalUsd),
    },
    collateral: {
      spotValueUsd: roundUsd(spotValueUsd),
      liquidationValueUsd: roundUsd(liquidationValueUsd),
      stressedValueUsd: roundUsd(stressedValueUsd),
      effectiveRecoveryValueUsd: roundUsd(effectiveRecoveryValueUsd),
      requestedLtv: roundRatio(requestedLtv),
      maximumLtv: roundRatio(maximumLtv),
      stressedLtv: roundRatio(stressedLtv),
      cureMonths,
      haircuts: mapValues(haircuts, roundRatio),
    },
    facility: {
      requestedPrincipalUsd: roundUsd(request.facility.requestedPrincipalUsd),
      supportedPrincipalUsd: roundUsd(supportedPrincipalUsd),
      counterofferPrincipalUsd: needsCounteroffer
        ? roundUsd(supportedPrincipalUsd)
        : null,
      annualRate: roundRatio(request.facility.annualRate),
      durationMonths: request.facility.durationMonths,
    },
    loss: {
      probabilityOfDefault: null,
      exposureAtDefaultUsd: roundUsd(exposureAtDefaultUsd),
      lossGivenDefault: roundRatio(lossGivenDefault),
      expectedLossUsd: null,
    },
    dataQuality: {
      complete: dataComplete,
      evidence: {
        income: request.borrower.financials.incomeEvidence,
        credit: request.borrower.credit.creditEvidence,
        market: request.collateral.marketEvidence,
      },
    },
    methodology: [
      "Affordability uses stressed debt-service and residual-income constraints.",
      "Collateral capacity uses transparent liquidity, custody, oracle, liquidation-delay, volatility, and drawdown haircuts.",
      "Facility loss reports EAD and LGD; PD and expected loss remain null until a validated outcome dataset exists.",
      "Every policy threshold and reason code is inspectable and versioned.",
    ],
    warnings: [
      "This is decision support, not an automated credit approval.",
      ...(policy.status === "provisional"
        ? [
            "The borrower scorecard is uncalibrated; probability of default and expected loss are intentionally unavailable.",
          ]
        : []),
      ...(!dataComplete
        ? [
            "One or more evidence sources or required affordability inputs are not verified.",
          ]
        : []),
    ],
  };
}

function scoreCreditValue(
  score: number | undefined,
  scale: string | undefined,
  addReason: (reason: DecisionReason, score: number) => void,
): void {
  if (score === undefined) {
    return;
  }

  const normalizedScale = scale?.toUpperCase().replaceAll(" ", "") ?? "";
  if (
    !normalizedScale.includes("FICO") ||
    !normalizedScale.includes("300-850")
  ) {
    addReason(
      reason(
        "CREDIT_SCORE_UNMAPPED",
        "info",
        "Credit score was not scored",
        "The supplied credit-score scale is not an explicitly supported FICO 300-850 scale, so the value is displayed but does not change risk.",
        scale ?? "missing scale",
        "FICO 300-850",
      ),
      0,
    );
    return;
  }

  if (score < 580) {
    addReason(
      reason(
        "CREDIT_SCORE_VERY_LOW",
        "critical",
        "Credit score is very low",
        "The verified FICO score indicates materially elevated repayment risk and requires manual underwriting.",
        score,
        ">= 580",
      ),
      25,
    );
  } else if (score < 670) {
    addReason(
      reason(
        "CREDIT_SCORE_BELOW_POLICY_REVIEW",
        "warning",
        "Credit score needs review",
        "The verified FICO score is below the provisional review threshold.",
        score,
        ">= 670",
      ),
      12,
    );
  }
}

export function runBorrowerRiskScenarios(
  request: BorrowerRiskScenarioRequest,
  options: AssessBorrowerRiskOptions = {},
): BorrowerRiskScenarioResponse {
  const policy = options.policy ?? PROVISIONAL_RISK_POLICY;
  const now = options.now ?? new Date();
  const base = assessBorrowerRisk(request.assessment, {
    ...options,
    policy,
    now,
    assessmentId: `${options.assessmentId ?? "assessment"}-base`,
  });
  const scenarioIds =
    request.scenarioIds ??
    (Object.keys(BORROWER_SCENARIOS) as BorrowerScenarioId[]);

  return {
    generatedAt: now.toISOString(),
    policyVersion: policy.version,
    results: scenarioIds.map((scenarioId) => {
      const scenario = BORROWER_SCENARIOS[scenarioId];
      const stressed = assessBorrowerRisk(
        scenario.apply(request.assessment, policy),
        {
          ...options,
          policy,
          now,
          assessmentId: `${options.assessmentId ?? "assessment"}-${scenarioId}`,
        },
      );

      return {
        scenarioId,
        label: scenario.label,
        description: scenario.description,
        base: {
          recommendation: base.recommendation,
          riskBand: base.riskBand,
          riskScore: base.riskScore,
          supportedPrincipalUsd: base.facility.supportedPrincipalUsd,
        },
        stressed: {
          recommendation: stressed.recommendation,
          riskBand: stressed.riskBand,
          riskScore: Math.max(base.riskScore, stressed.riskScore),
          supportedPrincipalUsd: Math.min(
            base.facility.supportedPrincipalUsd,
            stressed.facility.supportedPrincipalUsd,
          ),
          stressedLtv: stressed.collateral.stressedLtv,
          monthlyResidualIncomeUsd:
            stressed.affordability.monthlyResidualIncomeUsd,
        },
        mainRisks: stressed.topRisks,
      };
    }),
  };
}

export function getRiskPolicy(version?: string): RiskPolicy {
  if (version && version !== PROVISIONAL_RISK_POLICY.version) {
    throw new Error(`Unknown risk policy version: ${version}`);
  }

  return structuredClone(PROVISIONAL_RISK_POLICY);
}

const BORROWER_SCENARIOS: Record<
  BorrowerScenarioId,
  {
    label: string;
    description: string;
    apply(
      request: BorrowerRiskAssessmentRequest,
      policy: RiskPolicy,
    ): BorrowerRiskAssessmentRequest;
  }
> = {
  "collateral-crash": {
    label: "Collateral crash",
    description: "Collateral price falls 40% and observed drawdown increases.",
    apply: (request) =>
      cloneRequest(request, {
        collateral: {
          spotPriceUsd: request.collateral.spotPriceUsd * 0.6,
          maxDrawdown365d: Math.max(request.collateral.maxDrawdown365d, 0.7),
        },
      }),
  },
  "income-loss": {
    label: "Income loss",
    description: "Gross and net income fall by the policy stress percentage.",
    apply: (request, policy) =>
      cloneRequest(request, {
        financials: {
          annualGrossIncomeUsd:
            request.borrower.financials.annualGrossIncomeUsd *
            (1 - policy.incomeStress),
          ...(request.borrower.financials.monthlyNetIncomeUsd === undefined
            ? {}
            : {
                monthlyNetIncomeUsd:
                  request.borrower.financials.monthlyNetIncomeUsd *
                  (1 - policy.incomeStress),
              }),
        },
      }),
  },
  "rate-shock": {
    label: "Rate shock",
    description: "The facility rate rises by four percentage points.",
    apply: (request) =>
      cloneRequest(request, {
        facility: {
          annualRate: Math.min(1, request.facility.annualRate + 0.04),
        },
      }),
  },
  "liquidity-freeze": {
    label: "Liquidity freeze",
    description: "Reported 24-hour collateral liquidity falls 98%.",
    apply: (request) =>
      cloneRequest(request, {
        collateral: { volume24hUsd: request.collateral.volume24hUsd * 0.02 },
      }),
  },
  "combined-stress": {
    label: "Combined stress",
    description:
      "Collateral, income, rates, and market liquidity deteriorate together.",
    apply: (request, policy) =>
      cloneRequest(request, {
        facility: {
          annualRate: Math.min(1, request.facility.annualRate + 0.04),
        },
        financials: {
          annualGrossIncomeUsd:
            request.borrower.financials.annualGrossIncomeUsd *
            (1 - policy.incomeStress),
          ...(request.borrower.financials.monthlyNetIncomeUsd === undefined
            ? {}
            : {
                monthlyNetIncomeUsd:
                  request.borrower.financials.monthlyNetIncomeUsd *
                  (1 - policy.incomeStress),
              }),
        },
        collateral: {
          spotPriceUsd: request.collateral.spotPriceUsd * 0.6,
          maxDrawdown365d: Math.max(request.collateral.maxDrawdown365d, 0.7),
          volume24hUsd: request.collateral.volume24hUsd * 0.02,
        },
      }),
  },
};

function cloneRequest(
  request: BorrowerRiskAssessmentRequest,
  changes: {
    facility?: Partial<BorrowerRiskAssessmentRequest["facility"]>;
    financials?: Partial<
      BorrowerRiskAssessmentRequest["borrower"]["financials"]
    >;
    collateral?: Partial<BorrowerRiskAssessmentRequest["collateral"]>;
  },
): BorrowerRiskAssessmentRequest {
  return {
    ...request,
    borrower: {
      ...request.borrower,
      financials: { ...request.borrower.financials, ...changes.financials },
    },
    facility: { ...request.facility, ...changes.facility },
    collateral: { ...request.collateral, ...changes.collateral },
  };
}

function collateralHaircuts(collateral: RiskCollateral, spotValueUsd: number) {
  const liquidityRatio = collateral.volume24hUsd / Math.max(1, spotValueUsd);
  const liquidity =
    liquidityRatio > 1_000
      ? 0.015
      : liquidityRatio > 200
        ? 0.03
        : liquidityRatio > 50
          ? 0.055
          : 0.1;
  const custody =
    collateral.custodyModel === "qualified-custodian"
      ? 0.015
      : collateral.custodyModel === "self-custody"
        ? 0.035
        : 0.06;
  const oracle =
    collateral.oracleModel === "protocol-native"
      ? 0.01
      : collateral.oracleModel === "multi-source"
        ? 0.015
        : collateral.oracleModel === "single-source"
          ? 0.04
          : 0.08;
  const liquidationDelay = Math.min(
    0.3,
    collateral.annualVolatility * Math.sqrt(7 / 365) * 2.33,
  );
  const volatility = Math.min(0.4, collateral.annualVolatility * 0.2);
  const drawdown = Math.min(0.5, collateral.maxDrawdown365d * 0.5);

  return { liquidity, custody, oracle, liquidationDelay, volatility, drawdown };
}

function collateralAdvanceRate(
  collateral: RiskCollateral,
  policy: RiskPolicy,
  haircuts: ReturnType<typeof collateralHaircuts>,
): number {
  return clamp(
    0.64 -
      collateral.annualVolatility * 0.18 -
      collateral.maxDrawdown365d * 0.1 -
      (haircuts.liquidity + haircuts.custody + haircuts.oracle) * 0.15,
    policy.collateralAdvanceRateFloor,
    policy.collateralAdvanceRateCeiling,
  );
}

function scoreEvidence(
  label: "INCOME" | "CREDIT" | "MARKET",
  status: EvidenceStatus,
  addReason: (item: DecisionReason, score: number) => void,
): void {
  if (status === "verified") return;
  const missing = status === "missing";
  addReason(
    reason(
      `${label}_EVIDENCE_${missing ? "MISSING" : "STATED"}`,
      missing ? "critical" : "warning",
      `${titleCase(label)} evidence is ${missing ? "missing" : "unverified"}`,
      missing
        ? `No ${label.toLowerCase()} evidence was supplied.`
        : `${titleCase(label)} data was supplied without independent verification.`,
      status,
      "verified",
    ),
    missing ? 15 : 7,
  );
}

function reason(
  code: string,
  severity: DecisionReason["severity"],
  title: string,
  explanation: string,
  observed?: DecisionReason["observed"],
  threshold?: DecisionReason["threshold"],
): DecisionReason {
  return {
    code,
    severity,
    title,
    explanation,
    ...(observed === undefined ? {} : { observed }),
    ...(threshold === undefined ? {} : { threshold }),
  };
}

function monthlyPayment(
  principal: number,
  annualRate: number,
  months: number,
): number {
  if (principal <= 0 || months <= 0) return 0;
  const monthlyRate = annualRate / 12;
  if (monthlyRate === 0) return principal / months;
  const growth = (1 + monthlyRate) ** months;
  return (principal * monthlyRate * growth) / (growth - 1);
}

function principalFromPayment(
  payment: number,
  annualRate: number,
  months: number,
): number {
  if (payment <= 0 || months <= 0) return 0;
  const monthlyRate = annualRate / 12;
  if (monthlyRate === 0) return payment * months;
  const growth = (1 + monthlyRate) ** months;
  return (payment * (growth - 1)) / (monthlyRate * growth);
}

function bandFor(score: number): BorrowerRiskBand {
  if (score < 25) return "low";
  if (score < 50) return "moderate";
  if (score < 75) return "high";
  return "very-high";
}

function severityRank(severity: DecisionReason["severity"]): number {
  return severity === "critical" ? 3 : severity === "warning" ? 2 : 1;
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 99;
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundRatio(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function mapValues<T extends Record<string, number>>(
  value: T,
  mapper: (item: number) => number,
): T {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, mapper(item)]),
  ) as T;
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
