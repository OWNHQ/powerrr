export type BorrowerGrade = "A" | "B" | "C" | "D";
export type CollateralAsset = "ETH" | "BTC" | "SOL" | "WBTC" | "WETH";
export type CreditToken = "USD" | "USDC" | "USDT" | "DAI" | "EURC";
export type UnderwriterDecision =
  "approve" | "counteroffer" | "refer" | "decline";

export type BorrowerProfile = {
  grade: BorrowerGrade;
  annualIncome?: number | null;
  monthlyDebt: number;
};

export type CollateralInput = {
  asset: CollateralAsset;
  amount: number;
};

export type UnderwriterQuoteRequest = {
  collateral: CollateralInput;
  creditToken: CreditToken;
  durationMonths: number;
  borrower: BorrowerProfile;
  optionsHedge: boolean;
  loanAmount?: number | null;
};

export type MarketSnapshot = {
  asset: CollateralAsset;
  creditToken: CreditToken;
  spotPrice: number;
  annualVolatility: number;
  maxDrawdown365d: number;
  volume24hUsd: number;
  fundingRate: number;
  sources: string[];
  warnings: string[];
};

export type HedgeQuote = {
  available: boolean;
  source: string;
  expiryDays: number;
  strike: number;
  premiumPerUnit: number;
  protectedValuePerUnit: number;
  annualizedCostRate: number;
  warning?: string | null;
};

export type UnderwriterQuoteResponse = {
  decision: UnderwriterDecision;
  inputs: {
    collateral: CollateralInput;
    creditToken: CreditToken;
    durationMonths: number;
    borrower: BorrowerProfile;
    requestedLoanAmount: number | null;
  };
  terms: {
    maxLtv: number;
    spotLtv: number;
    approvedLoanAmount: number;
    maxLoanAmount: number;
    apr: number;
    monthlyPayment: number;
    durationMonths: number;
  };
  collateralAppraisal: {
    spotPrice: number;
    spotValue: number;
    liquidationValue: number;
    stressedValue: number;
    protectedValue: number;
    effectiveRecoveryValue: number;
    haircuts: {
      liquidity: number;
      custody: number;
      oracle: number;
      liquidationDelay: number;
      volatility: number;
      drawdown: number;
    };
  };
  hedge: HedgeQuote;
  risk: {
    borrowerPdAnnual: number;
    termPd: number;
    lgd: number;
    expectedLossRate: number;
    tailLossRate: number;
    fundingRate: number;
    hedgeCostSpread: number;
    unhedgedTailSpread: number;
    capitalSpread: number;
    liquiditySpread: number;
  };
  liquidationPolicy: {
    priceDeclineLiquidation: false;
    missedPaymentTrigger: true;
    partialLiquidationMaxMonths: 3;
    monthsCoverable: number;
    surplusBuffer: number;
    maxPartialSaleValue: number;
  };
  data: {
    sources: string[];
    warnings: string[];
    annualVolatility: number;
    maxDrawdown365d: number;
    volume24hUsd: number;
  };
  process: string[];
};

export type UnderwriterScenario = {
  name: string;
  payload: UnderwriterQuoteRequest;
};

export const BORROWER_PD: Record<BorrowerGrade, number> = {
  A: 0.01,
  B: 0.025,
  C: 0.055,
  D: 0.11,
};

export const BORROWER_LTV_CAP: Record<BorrowerGrade, number> = {
  A: 0.58,
  B: 0.5,
  C: 0.4,
  D: 0.28,
};

export const CREDIT_TOKENS: Record<
  CreditToken,
  { fundingFloor: number; stablecoin: boolean }
> = {
  USD: { fundingFloor: 0.045, stablecoin: false },
  USDC: { fundingFloor: 0.052, stablecoin: true },
  USDT: { fundingFloor: 0.057, stablecoin: true },
  DAI: { fundingFloor: 0.058, stablecoin: true },
  EURC: { fundingFloor: 0.04, stablecoin: true },
};

export const MARKET_FALLBACKS: Record<
  CollateralAsset,
  Omit<
    MarketSnapshot,
    "asset" | "creditToken" | "fundingRate" | "sources" | "warnings"
  >
> = {
  ETH: {
    spotPrice: 3_800,
    annualVolatility: 0.68,
    maxDrawdown365d: 0.62,
    volume24hUsd: 15_000_000_000,
  },
  BTC: {
    spotPrice: 108_000,
    annualVolatility: 0.52,
    maxDrawdown365d: 0.48,
    volume24hUsd: 28_000_000_000,
  },
  SOL: {
    spotPrice: 165,
    annualVolatility: 0.86,
    maxDrawdown365d: 0.72,
    volume24hUsd: 4_000_000_000,
  },
  WBTC: {
    spotPrice: 108_000,
    annualVolatility: 0.52,
    maxDrawdown365d: 0.48,
    volume24hUsd: 1_000_000_000,
  },
  WETH: {
    spotPrice: 3_800,
    annualVolatility: 0.68,
    maxDrawdown365d: 0.62,
    volume24hUsd: 1_500_000_000,
  },
};

export const UNDERWRITER_SCENARIOS: UnderwriterScenario[] = [
  {
    name: "Base ETH mortgage-like",
    payload: {
      collateral: { asset: "ETH", amount: 32 },
      creditToken: "USDC",
      durationMonths: 60,
      borrower: { grade: "B", annualIncome: 180_000, monthlyDebt: 2_200 },
      optionsHedge: true,
    },
  },
  {
    name: "Short high-quality BTC",
    payload: {
      collateral: { asset: "BTC", amount: 2.5 },
      creditToken: "USDC",
      durationMonths: 24,
      borrower: { grade: "A", annualIncome: 300_000, monthlyDebt: 2_500 },
      optionsHedge: true,
    },
  },
  {
    name: "Long unhedged ETH",
    payload: {
      collateral: { asset: "ETH", amount: 50 },
      creditToken: "DAI",
      durationMonths: 120,
      borrower: { grade: "C", annualIncome: 140_000, monthlyDebt: 3_100 },
      optionsHedge: false,
    },
  },
  {
    name: "Counteroffer stress",
    payload: {
      collateral: { asset: "SOL", amount: 1_000 },
      creditToken: "USDC",
      durationMonths: 72,
      borrower: { grade: "C", annualIncome: 95_000, monthlyDebt: 1_800 },
      optionsHedge: true,
      loanAmount: 90_000,
    },
  },
];

export function quoteOwnUnderwriter(
  request: UnderwriterQuoteRequest,
): UnderwriterQuoteResponse {
  validateRequest(request);
  const snapshot = marketSnapshot(
    request.collateral.asset,
    request.creditToken,
  );
  const hedge = hedgeQuote(
    request.collateral.asset,
    snapshot.spotPrice,
    snapshot.annualVolatility,
    request.optionsHedge,
  );
  const amount = request.collateral.amount;
  const spotValue = amount * snapshot.spotPrice;
  const liquidityHaircut = liquidityHaircutFor(
    snapshot.volume24hUsd,
    spotValue,
  );
  const custodyHaircut = 0.025;
  const oracleHaircut = 0.01;
  const liquidationDelayHaircut = Math.min(
    0.22,
    snapshot.annualVolatility * Math.sqrt(7 / 365) * 2.33,
  );
  const volatilityHaircut = Math.min(0.35, snapshot.annualVolatility * 0.18);
  const drawdownHaircut = Math.min(0.45, snapshot.maxDrawdown365d * 0.45);
  const totalLiquidationHaircut = Math.min(
    0.7,
    liquidityHaircut + custodyHaircut + oracleHaircut + liquidationDelayHaircut,
  );
  const liquidationValue = spotValue * (1 - totalLiquidationHaircut);
  const stressedValue =
    spotValue *
    (1 -
      Math.min(0.78, volatilityHaircut + drawdownHaircut + liquidityHaircut));
  const protectedValue = amount * hedge.protectedValuePerUnit;
  const effectiveRecoveryValue = Math.max(
    0,
    Math.max(protectedValue, stressedValue * 0.9),
  );
  const years = request.durationMonths / 12;
  const borrowerGrade = request.borrower.grade;
  const pdAnnual = BORROWER_PD[borrowerGrade];
  const termPd = 1 - (1 - pdAnnual) ** years;
  const collateralQualityCap = collateralLtvCap(
    snapshot.annualVolatility,
    snapshot.maxDrawdown365d,
  );
  const hedgeCap = hedge.available ? 0.56 : request.optionsHedge ? 0.46 : 0.4;
  const durationCap = Math.max(
    0.24,
    0.58 - Math.max(0, request.durationMonths - 12) * 0.0025,
  );
  const recoveryCap =
    spotValue > 0 ? (0.92 * effectiveRecoveryValue) / spotValue : 0;
  const affordabilityCap = affordabilityCapFor(
    request.borrower,
    snapshot.fundingRate,
    request.durationMonths,
    spotValue,
  );
  const maxLtv = Math.max(
    0.1,
    Math.min(
      BORROWER_LTV_CAP[borrowerGrade],
      collateralQualityCap,
      hedgeCap,
      durationCap,
      recoveryCap,
      affordabilityCap,
    ),
  );
  const maxLoanAmount = spotValue * maxLtv;
  const requestedAmount = request.loanAmount ?? maxLoanAmount;
  const approvedAmount = Math.min(requestedAmount, maxLoanAmount);
  const utilization = maxLoanAmount > 0 ? approvedAmount / maxLoanAmount : 1;
  const averageBalance = approvedAmount * 0.55;
  const ead = averageBalance * 1.03;
  const recoveryAtDefault = Math.min(effectiveRecoveryValue, liquidationValue);
  const lgd = Math.max(
    0,
    Math.min(1, (ead - recoveryAtDefault) / Math.max(1, ead)),
  );
  const expectedLossRate = (termPd * lgd) / Math.max(0.25, years);
  const tailLossRate = Math.max(
    0,
    (approvedAmount - stressedValue * 0.75) / Math.max(1, approvedAmount),
  );
  const hedgeCostSpread =
    hedge.annualizedCostRate *
    Math.min(1, approvedAmount / Math.max(1, protectedValue));
  let unhedgedTailSpread = 0;
  if (!hedge.available) {
    unhedgedTailSpread =
      0.035 +
      snapshot.annualVolatility * 0.035 +
      (Math.max(0, request.durationMonths - 12) / 12) * 0.002;
    if (!request.optionsHedge) {
      unhedgedTailSpread += 0.01;
    }
  }
  const capitalSpread =
    (0.08 + 0.18 * tailLossRate + 0.06 * utilization) * 0.14;
  const servicingSpread = 0.012;
  const liquiditySpread = liquidityHaircut * 0.2;
  const margin = 0.018;
  const apr = clamp(
    snapshot.fundingRate +
      expectedLossRate +
      capitalSpread +
      hedgeCostSpread +
      unhedgedTailSpread +
      servicingSpread +
      liquiditySpread +
      margin,
    snapshot.fundingRate + 0.045,
    0.38,
  );
  const monthlyPayment = monthlyPaymentFor(
    approvedAmount,
    apr,
    request.durationMonths,
  );
  const partialLiquidationCapacity = partialLiquidationCapacityFor(
    approvedAmount,
    monthlyPayment,
    liquidationValue,
    maxLtv,
  );
  const decision = decisionFor(
    requestedAmount,
    approvedAmount,
    maxLtv,
    request.borrower,
    monthlyPayment,
  );
  const warnings = [...snapshot.warnings];
  if (hedge.warning) {
    warnings.push(hedge.warning);
  }
  if (request.loanAmount && request.loanAmount > maxLoanAmount) {
    warnings.push("requested loan exceeds model max; approved amount capped");
  }
  if (partialLiquidationCapacity.monthsCoverable < 3) {
    warnings.push(
      "collateral buffer cannot cover full 3-month partial-liquidation policy",
    );
  }

  return {
    decision,
    inputs: {
      collateral: request.collateral,
      creditToken: request.creditToken,
      durationMonths: request.durationMonths,
      borrower: request.borrower,
      requestedLoanAmount: request.loanAmount ?? null,
    },
    terms: {
      maxLtv: roundRatio(maxLtv),
      spotLtv: roundRatio(approvedAmount / spotValue),
      approvedLoanAmount: roundUsd(approvedAmount),
      maxLoanAmount: roundUsd(maxLoanAmount),
      apr: roundRatio(apr),
      monthlyPayment: roundUsd(monthlyPayment),
      durationMonths: request.durationMonths,
    },
    collateralAppraisal: {
      spotPrice: roundUsd(snapshot.spotPrice),
      spotValue: roundUsd(spotValue),
      liquidationValue: roundUsd(liquidationValue),
      stressedValue: roundUsd(stressedValue),
      protectedValue: roundUsd(protectedValue),
      effectiveRecoveryValue: roundUsd(effectiveRecoveryValue),
      haircuts: {
        liquidity: roundRatio(liquidityHaircut),
        custody: roundRatio(custodyHaircut),
        oracle: roundRatio(oracleHaircut),
        liquidationDelay: roundRatio(liquidationDelayHaircut),
        volatility: roundRatio(volatilityHaircut),
        drawdown: roundRatio(drawdownHaircut),
      },
    },
    hedge,
    risk: {
      borrowerPdAnnual: roundRatio(pdAnnual),
      termPd: roundRatio(termPd),
      lgd: roundRatio(lgd),
      expectedLossRate: roundRatio(expectedLossRate),
      tailLossRate: roundRatio(tailLossRate),
      fundingRate: roundRatio(snapshot.fundingRate),
      hedgeCostSpread: roundRatio(hedgeCostSpread),
      unhedgedTailSpread: roundRatio(unhedgedTailSpread),
      capitalSpread: roundRatio(capitalSpread),
      liquiditySpread: roundRatio(liquiditySpread),
    },
    liquidationPolicy: partialLiquidationCapacity,
    data: {
      sources: snapshot.sources,
      warnings,
      annualVolatility: roundRatio(snapshot.annualVolatility),
      maxDrawdown365d: roundRatio(snapshot.maxDrawdown365d),
      volume24hUsd: roundUsd(snapshot.volume24hUsd),
    },
    process: [
      "Use deterministic spot, volatility, drawdown, funding proxy, and option hedge assumptions.",
      "Appraise collateral using mortgage-style valuation plus crypto liquidity/custody/oracle haircuts.",
      "Estimate a 12-month protected collateral floor from listed-put fixtures or volatility-derived fallback.",
      "Project amortizing exposure while keeping full pledged collateral locked.",
      "Estimate PD/LGD/EAD expected loss and tail loss.",
      "Set max LTV from borrower, collateral, hedge, term, recovery, and affordability constraints.",
      "Build APR from funding, expected loss, capital, hedge, servicing, liquidity, and margin spreads.",
    ],
  };
}

export function marketSnapshot(
  asset: CollateralAsset,
  creditToken: CreditToken,
): MarketSnapshot {
  const fallback = MARKET_FALLBACKS[asset];
  const credit = CREDIT_TOKENS[creditToken];

  return {
    asset,
    creditToken,
    spotPrice: fallback.spotPrice,
    annualVolatility: clamp(fallback.annualVolatility, 0.2, 1.5),
    maxDrawdown365d: clamp(fallback.maxDrawdown365d, 0.05, 0.95),
    volume24hUsd: fallback.volume24hUsd,
    fundingRate: credit.fundingFloor,
    sources: ["deterministic OWN underwriting market assumptions"],
    warnings: [
      "Using deterministic market data; no public API or paid data source was queried.",
    ],
  };
}

export function hedgeQuote(
  asset: CollateralAsset,
  spotPrice: number,
  annualVolatility: number,
  enabled: boolean,
  floorPct = 0.7,
): HedgeQuote {
  const strike = spotPrice * floorPct;
  if (!enabled) {
    return {
      available: false,
      source: "disabled",
      expiryDays: 365,
      strike: roundUsd(strike),
      premiumPerUnit: 0,
      protectedValuePerUnit: roundUsd(strike),
      annualizedCostRate: 0,
      warning: "options hedge disabled by request",
    };
  }

  if (
    asset === "ETH" ||
    asset === "WETH" ||
    asset === "BTC" ||
    asset === "WBTC"
  ) {
    const premium = spotPrice * 0.08;
    return {
      available: true,
      source: `deterministic ${asset === "BTC" || asset === "WBTC" ? "BTC" : "ETH"} 12m put fixture`,
      expiryDays: 365,
      strike: roundUsd(strike),
      premiumPerUnit: roundUsd(premium),
      protectedValuePerUnit: roundUsd(
        Math.max(0, strike - premium - spotPrice * 0.015),
      ),
      annualizedCostRate: roundRatio(premium / spotPrice),
    };
  }

  const premium = blackScholesPut(
    spotPrice,
    strike,
    1,
    0.045,
    annualVolatility,
  );
  return {
    available: false,
    source: "synthetic volatility estimate",
    expiryDays: 365,
    strike: roundUsd(strike),
    premiumPerUnit: roundUsd(premium),
    protectedValuePerUnit: roundUsd(
      Math.max(0, strike - premium - spotPrice * 0.015),
    ),
    annualizedCostRate: roundRatio(premium / spotPrice),
    warning: "listed 12m put fixture unavailable; synthetic estimate used",
  };
}

export function normalizeUnderwriterRequest(
  payload: unknown,
): UnderwriterQuoteRequest {
  const input = isRecord(payload) ? payload : {};
  const collateral = isRecord(input.collateral) ? input.collateral : {};
  const borrower = isRecord(input.borrower) ? input.borrower : {};
  const asset = normalizeAsset(
    String(
      collateral.asset ??
        input.collateralAsset ??
        input.collateral_asset ??
        input.collateral ??
        "ETH",
    ),
  );
  const creditToken = normalizeCreditToken(
    String(input.creditToken ?? input.credit_token ?? "USDC"),
  );
  const annualIncome =
    borrower.annualIncome ??
    borrower.annual_income ??
    borrower.annualIncomeUsd ??
    borrower.annual_income_usd ??
    input.annualIncome ??
    input.annual_income ??
    input.annualIncomeUsd ??
    input.annual_income_usd;
  const monthlyDebt =
    borrower.monthlyDebt ??
    borrower.monthly_debt ??
    borrower.monthlyDebtUsd ??
    borrower.monthly_debt_usd ??
    input.monthlyDebt ??
    input.monthly_debt ??
    input.monthlyDebtUsd ??
    input.monthly_debt_usd;

  return {
    collateral: {
      asset,
      amount: numberValue(
        collateral.amount ?? input.collateralAmount ?? input.collateral_amount,
        1,
      ),
    },
    creditToken,
    durationMonths: integerValue(
      input.durationMonths ?? input.duration_months,
      60,
    ),
    borrower: {
      grade: normalizeGrade(
        String(
          borrower.grade ?? input.borrowerGrade ?? input.borrower_grade ?? "B",
        ),
      ),
      annualIncome: optionalNumber(annualIncome),
      monthlyDebt: numberValue(monthlyDebt, 0),
    },
    optionsHedge: booleanValue(input.optionsHedge ?? input.options_hedge, true),
    loanAmount: optionalNumber(
      input.loanAmount ??
        input.loan_amount ??
        input.requestedLoanAmount ??
        input.requested_loan_amount,
    ),
  };
}

function validateRequest(request: UnderwriterQuoteRequest): void {
  if (request.collateral.amount <= 0) {
    throw new Error("collateral amount must be positive");
  }

  if (request.durationMonths < 3 || request.durationMonths > 360) {
    throw new Error("durationMonths must be between 3 and 360");
  }

  if (
    request.loanAmount !== null &&
    request.loanAmount !== undefined &&
    request.loanAmount <= 0
  ) {
    throw new Error("loanAmount must be positive when provided");
  }
}

function liquidityHaircutFor(
  volume24hUsd: number,
  positionValue: number,
): number {
  if (positionValue <= 0) {
    return 0.2;
  }

  const volumeRatio = volume24hUsd / positionValue;
  if (volumeRatio > 1_000) {
    return 0.015;
  }

  if (volumeRatio > 200) {
    return 0.03;
  }

  if (volumeRatio > 50) {
    return 0.055;
  }

  return 0.1;
}

function collateralLtvCap(volatility: number, drawdown: number): number {
  return Math.max(
    0.24,
    Math.min(0.6, 0.62 - volatility * 0.18 - drawdown * 0.1),
  );
}

function affordabilityCapFor(
  borrower: BorrowerProfile,
  fundingRate: number,
  months: number,
  spotValue: number,
): number {
  if (!borrower.annualIncome) {
    return 0.6;
  }

  const maxPayment = Math.max(
    0,
    (borrower.annualIncome / 12) * 0.36 - borrower.monthlyDebt,
  );
  if (maxPayment <= 0) {
    return 0.12;
  }

  const affordableLoan = principalFromPayment(
    maxPayment,
    fundingRate + 0.1,
    months,
  );
  return Math.max(0.12, Math.min(0.6, affordableLoan / spotValue));
}

function partialLiquidationCapacityFor(
  loanAmount: number,
  monthlyPayment: number,
  liquidationValue: number,
  maxLtv: number,
): UnderwriterQuoteResponse["liquidationPolicy"] {
  const targetBufferValue = loanAmount / Math.max(0.01, maxLtv);
  const surplus = Math.max(0, liquidationValue - targetBufferValue);
  const monthsCoverable = Math.min(
    3,
    Math.floor(surplus / Math.max(1, monthlyPayment)),
  );

  return {
    priceDeclineLiquidation: false,
    missedPaymentTrigger: true,
    partialLiquidationMaxMonths: 3,
    monthsCoverable,
    surplusBuffer: roundUsd(surplus),
    maxPartialSaleValue: roundUsd(Math.min(surplus, monthlyPayment * 3)),
  };
}

function decisionFor(
  requestedAmount: number,
  approvedAmount: number,
  maxLtv: number,
  borrower: BorrowerProfile,
  monthlyPayment: number,
): UnderwriterDecision {
  if (maxLtv < 0.16) {
    return "decline";
  }

  if (requestedAmount > approvedAmount * 1.005) {
    return "counteroffer";
  }

  if (borrower.annualIncome) {
    const disposable =
      (borrower.annualIncome / 12) * 0.36 - borrower.monthlyDebt;
    if (monthlyPayment > disposable) {
      return "refer";
    }
  }

  return "approve";
}

function monthlyPaymentFor(
  principal: number,
  annualRate: number,
  months: number,
): number {
  if (principal <= 0) {
    return 0;
  }

  const monthlyRate = annualRate / 12;
  if (monthlyRate === 0) {
    return principal / months;
  }

  const growth = (1 + monthlyRate) ** months;
  return (principal * monthlyRate * growth) / (growth - 1);
}

function principalFromPayment(
  payment: number,
  annualRate: number,
  months: number,
): number {
  const monthlyRate = annualRate / 12;
  if (monthlyRate === 0) {
    return payment * months;
  }

  const growth = (1 + monthlyRate) ** months;
  return (payment * (growth - 1)) / (monthlyRate * growth);
}

function blackScholesPut(
  spot: number,
  strike: number,
  years: number,
  rate: number,
  vol: number,
): number {
  if (spot <= 0 || strike <= 0 || years <= 0 || vol <= 0) {
    return Math.max(0, strike - spot);
  }

  const d1 =
    (Math.log(spot / strike) + (rate + 0.5 * vol * vol) * years) /
    (vol * Math.sqrt(years));
  const d2 = d1 - vol * Math.sqrt(years);
  return (
    strike * Math.exp(-rate * years) * normalCdf(-d2) - spot * normalCdf(-d1)
  );
}

function normalCdf(value: number): number {
  return 0.5 * (1 + erf(value / Math.sqrt(2)));
}

function erf(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y =
    1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return sign * y;
}

function normalizeAsset(value: string): CollateralAsset {
  const upper = value.toUpperCase();
  if (upper in MARKET_FALLBACKS) {
    return upper as CollateralAsset;
  }

  throw new Error(`unsupported collateral asset: ${value}`);
}

function normalizeCreditToken(value: string): CreditToken {
  const upper = value.toUpperCase();
  if (upper in CREDIT_TOKENS) {
    return upper as CreditToken;
  }

  throw new Error(`unsupported credit token: ${value}`);
}

function normalizeGrade(value: string): BorrowerGrade {
  const upper = value.toUpperCase();
  if (upper in BORROWER_PD) {
    return upper as BorrowerGrade;
  }

  throw new Error("borrower grade must be one of A, B, C, D");
}

function numberValue(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
  }

  return fallback;
}

function integerValue(value: unknown, fallback: number): number {
  return Math.trunc(numberValue(value, fallback));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundUsd(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value * 100) / 100;
}

function roundRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value * 10_000) / 10_000;
}

export {
  assessBorrowerRisk,
  getRiskPolicy,
  PROVISIONAL_RISK_POLICY,
  runBorrowerRiskScenarios,
  type AssessBorrowerRiskOptions,
} from "./risk.js";

export {
  calculateOwnOpportunity,
  OWN_OPPORTUNITY_POLICY_VERSION,
  type OwnOpportunityConfig,
} from "./opportunity.js";
