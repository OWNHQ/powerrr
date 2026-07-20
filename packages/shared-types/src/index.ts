export type HexAddress = `0x${string}`;
export type ChainId = 1;

export type QuoteMode = "wallet-estimate" | "existing-position";
export type RiskLevel = "low" | "medium" | "high" | "unknown";
export type Confidence = "high" | "medium" | "low";
export type SafetyProfile = "max" | "balanced" | "conservative";
export type RateType = "fixed" | "variable" | "mixed" | "unknown";
export type AnnualRateConvention = "apr" | "apy";
export type FreshnessStatus = "fresh" | "stale" | "unknown";
export type RuntimeTier = "fixture" | "public-rpc-preview" | "production";
export type LiquidationRisk =
  | "none-assumed-own"
  | "health-factor"
  | "ltv-threshold"
  | "vault-specific"
  | "unknown";

export type AddressInput = {
  chainId: number;
  input: string;
  resolvedAddress: HexAddress;
  resolvedEnsName?: string;
  blockNumber?: string;
  blockTimestamp?: string;
};

export type PortfolioAsset = {
  chainId: number;
  token: HexAddress;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balanceRaw: string;
  marketPriceUsd?: number;
  priceStatus?: "available" | "unavailable";
  protocolEligible: Record<string, boolean>;
  assetKind?: "native" | "erc20" | "convertible";
  protocolAssetToken?: HexAddress;
  protocolBalanceRaw?: string;
  requiredAction?: "wrap";
  conversion?: {
    kind: "one-to-one" | "wsteth";
    fromSymbol: string;
    toSymbol: string;
    rate: string;
  };
};

export type PortfolioSummary = {
  totalValueUsd: number;
  eligibleCollateralUsd: number;
  discoveredAssets: number;
  supportedWalletValueUsd?: number;
  matchedCollateralUsd?: number;
  matchedAssetCount?: number;
};

export type CollateralUsed = {
  token: HexAddress;
  symbol: string;
  valueUsd: number;
  ltv?: number | null;
  liquidationThreshold?: number | null;
  marketId?: string;
  vaultId?: string;
};

export type QuoteProvenance = {
  source: string;
  sourceType:
    "fixture" | "official-api" | "on-chain" | "fallback" | "assumption";
  freshnessSeconds?: number;
  freshnessStatus?: FreshnessStatus;
  fetchedAt?: string;
  observedAt?: string;
  blockNumber?: string;
  blockTimestamp?: string;
};

export type SourceObservation = {
  sourceId: string;
  sourceLabel: string;
  sourceType: QuoteProvenance["sourceType"];
  fetchedAt: string;
  observedAt?: string;
  blockNumber?: string;
  blockTimestamp?: string;
  ageSeconds?: number;
  freshness: FreshnessStatus;
};

export type AnnualRate = {
  value: number;
  convention: AnnualRateConvention;
  rateType: RateType;
  sourceId: string;
};

export type ProtocolBorrowQuote = {
  protocolId: string;
  protocolLabel: string;
  familyId: string;
  familyLabel: string;
  chainId: number;
  mode: QuoteMode;
  theoreticalBorrowUsd: number | null;
  safeBorrowUsd: number | null;
  existingDebtUsd?: number | null;
  availableLiquidityUsd?: number | null;
  targetBorrowAsset: string;
  rateType: RateType;
  indicativeApr?: number | null;
  annualRate?: AnnualRate | null;
  termMonths?: number | null;
  liquidationRisk: LiquidationRisk;
  collateralUsed: CollateralUsed[];
  healthFactor?: number | null;
  riskLevel: RiskLevel;
  confidence: Confidence;
  confidenceScore: number;
  stale: boolean;
  timestamp: string;
  assumptions: string[];
  warnings: string[];
  provenance: QuoteProvenance[];
};

export type ProtocolMetadata = {
  id: string;
  label: string;
  familyId: string;
  familyLabel: string;
  supports: number[];
  targetBorrowAssets: string[];
  rateType: RateType;
  liquidationRisk: LiquidationRisk;
  dataPriority: string[];
  caveats: string[];
  status: "fixture-mode" | "live-ready" | "disabled";
};

export type ProtocolAdapterInput = {
  address: HexAddress;
  chainId: number;
  mode: QuoteMode;
  portfolio: PortfolioAsset[];
  targetBorrowAssets: string[];
  safetyProfile: SafetyProfile;
  asOfBlock?: string;
  blockTimestamp?: string;
  now?: Date;
};

export interface ProtocolAdapter {
  id: string;
  label: string;
  metadata: ProtocolMetadata;
  supports(chainId: number): boolean;
  quote(input: ProtocolAdapterInput): Promise<ProtocolBorrowQuote[]>;
}

export type QuoteRequest = {
  chainId: number;
  input: {
    address?: string | undefined;
    ensName?: string | undefined;
  };
  mode: QuoteMode;
  targetBorrowAssets?: string[];
  safetyProfile?: SafetyProfile;
  includeProtocols?: string[];
  asOfBlock?: string | null;
};

export type QuoteResponse = {
  requestId: string;
  resolvedAddress: HexAddress;
  resolvedEnsName?: string;
  chainId: number;
  mode: QuoteMode;
  blockNumber: string;
  blockTimestamp?: string;
  calculatedAt: string;
  servedAt: string;
  generatedAt: string;
  dataMode: "fixtures" | "live";
  runtimeTier: RuntimeTier;
  sourcePolicySatisfied: boolean;
  completeness: "complete" | "partial";
  cache: {
    status: "hit" | "miss";
    ageSeconds: number;
  };
  productionSafe: boolean;
  observations: SourceObservation[];
  quotes: ProtocolBorrowQuote[];
  opportunities?: BorrowOpportunity[];
  portfolio: PortfolioResponse;
  portfolioSummary: PortfolioSummary;
  protocolAvailability: ProtocolAvailability[];
  warnings: string[];
};

export type ProtocolAvailability = {
  protocolId: string;
  status: "available" | "unavailable";
  code?:
    | "NOT_CONFIGURED"
    | "DEADLINE_EXCEEDED"
    | "SOURCE_READ_FAILED"
    | "UNSUPPORTED";
  reason?: string;
};

export type BorrowOpportunity = {
  id: "own";
  label: "OWN";
  rail: "own";
  kind: "indicative-request";
  potentialBorrowUsd: number;
  availableNowUsd: number;
  fundingStatus:
    "available-now" | "limited" | "request-required" | "unavailable";
  indicativeApr: number;
  termMonths: number;
  collateralUsed: CollateralUsed[];
  policyVersion: string;
  riskModel: "maturity-default";
  assumptions: string[];
  warnings: string[];
};

export type OwnLeadCollateral = {
  symbol: string;
  valueUsd: number;
};

export type OwnLeadRequest = {
  idempotencyKey: string;
  email: string;
  wallet: string;
  requestedAmountUsd: number;
  creditAsset: "USDC";
  termMonths: number;
  collateral: OwnLeadCollateral[];
  policyVersion: string;
  consent: true;
  website?: string;
};

export type OwnLeadResponse = {
  accepted: true;
  requestId: string;
  delivery: "webhook" | "development-mock" | "honeypot";
};

export type OwnLeadStatusResponse = {
  enabled: boolean;
  reason?: string;
};

export type WebsiteQuoteRow = {
  protocolId: string;
  protocolLabel: string;
  amountDisplay: string;
  theoreticalBorrowUsd: number | null;
  safeBorrowUsd: number | null;
  targetBorrowAsset: string;
  eligibleCollateralDisplay: string;
  eligibleCollateralUsd: number;
  rateType: RateType;
  indicativeApr: number | null;
  termLabel: string;
  liquidationRiskLabel: string;
  riskLevel: RiskLevel;
  confidence: Confidence;
  confidenceLabel: string;
  freshnessLabel: string;
  availableLiquidityUsd: number | null;
  cta: {
    label: string;
    action: "open-drawer" | "open-apply-flow";
  };
};

export type ResolveRequest = {
  chainId: number;
  input: {
    address?: string | undefined;
    ensName?: string | undefined;
  };
};

export type ResolveResponse = AddressInput;

export type PortfolioRequest = ResolveRequest;

export type PortfolioResponse = {
  resolvedAddress: HexAddress;
  resolvedEnsName?: string;
  chainId: number;
  assets: PortfolioAsset[];
  summary: PortfolioSummary;
  completeness?: "complete" | "partial";
  provenance: QuoteProvenance[];
  warnings: string[];
};

export type OwnRiskRequest = {
  chainId: number;
  input: {
    address?: string | undefined;
    ensName?: string | undefined;
  };
  requestedPrincipalUsd?: number;
  termMonths?: 12 | 24 | 36;
};

export type OwnRiskMetric = {
  name: string;
  value: number;
  unit: "usd" | "ratio" | "percent";
  explanation: string;
};

export type OwnRiskResponse = {
  resolvedAddress: HexAddress;
  termMonths: 12 | 24 | 36;
  offeredPrincipalUsd: number;
  requestedPrincipalUsd: number | null;
  fixedApr: number;
  monthlyPaymentUsd: number;
  endingBalanceUsd: number;
  metrics: OwnRiskMetric[];
  assumptions: string[];
  warnings: string[];
};

export type ScenarioId =
  | "eth-btc-spot-shock"
  | "lst-lrt-basis-widening"
  | "stablecoin-depeg"
  | "oracle-divergence-staleness"
  | "liquidity-withdrawal"
  | "rate-spike"
  | "combined-crash"
  | "own-delinquency-lag";

export type ScenarioDefinition = {
  id: ScenarioId;
  label: string;
  description: string;
  collateralShock: Record<string, number>;
  liquidityMultiplier: number;
  aprShockBps: number;
  confidencePenalty: number;
  protocolSafeBorrowMultiplier?: Record<string, number>;
};

export type ScenarioQuoteResult = {
  scenarioId: ScenarioId;
  scenarioLabel: string;
  protocolId: string;
  protocolLabel: string;
  baseSafeBorrowUsd: number | null;
  stressedSafeBorrowUsd: number | null;
  baseHealthFactor?: number | null;
  stressedHealthFactor?: number | null;
  confidence: Confidence;
  warnings: string[];
};

export type SimulationRequest = QuoteRequest & {
  scenarioIds?: ScenarioId[];
};

export type SimulationResponse = {
  requestId: string;
  resolvedAddress: HexAddress;
  generatedAt: string;
  results: ScenarioQuoteResult[];
  assumptions: string[];
};

export type ApiErrorCode =
  | "INVALID_INPUT"
  | "UNSUPPORTED_CHAIN"
  | "ENS_RESOLUTION_FAILED"
  | "PORTFOLIO_UNAVAILABLE"
  | "PROTOCOL_SOURCE_UNAVAILABLE"
  | "STALE_QUOTE_ONLY"
  | "SIMULATION_FAILED"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "UNAUTHORIZED"
  | "INTERNAL_ERROR";

export type ApiError = {
  code: ApiErrorCode;
  message: string;
  requestId?: string;
  details?: unknown;
};

export type EvidenceStatus = "verified" | "stated" | "missing";
export type EmploymentStatus =
  | "employed"
  | "self-employed"
  | "contract"
  | "retired"
  | "unemployed"
  | "other";
export type AssessmentRecommendation =
  "within-policy" | "counteroffer" | "manual-review" | "outside-policy";
export type BorrowerRiskBand = "low" | "moderate" | "high" | "very-high";
export type CalibrationStatus = "uncalibrated" | "validated";
export type DecisionReasonSeverity = "info" | "warning" | "critical";
export type BorrowerScenarioId =
  | "collateral-crash"
  | "income-loss"
  | "rate-shock"
  | "liquidity-freeze"
  | "combined-stress";

export type BorrowerFinancialProfile = {
  annualGrossIncomeUsd: number;
  monthlyNetIncomeUsd?: number;
  monthlyDebtPaymentsUsd: number;
  monthlyLivingExpensesUsd: number;
  employmentStatus: EmploymentStatus;
  incomeEvidence: EvidenceStatus;
};

export type BorrowerCreditProfile = {
  creditScore?: number;
  creditScoreScale?: string;
  missedPayments24m: number;
  defaultsOrCollections: number;
  activeBankruptcy: boolean;
  creditEvidence: EvidenceStatus;
};

export type RiskFacility = {
  requestedPrincipalUsd: number;
  annualRate: number;
  durationMonths: number;
  repaymentType: "amortizing";
  creditToken: string;
};

export type RiskCollateral = {
  asset: string;
  amount: number;
  spotPriceUsd: number;
  annualVolatility: number;
  maxDrawdown365d: number;
  volume24hUsd: number;
  custodyModel: "self-custody" | "qualified-custodian" | "third-party";
  oracleModel: "protocol-native" | "multi-source" | "single-source" | "manual";
  hedgeFloorUsd?: number;
  marketEvidence: EvidenceStatus;
};

export type BorrowerRiskAssessmentRequest = {
  applicationId?: string;
  borrower: {
    financials: BorrowerFinancialProfile;
    credit: BorrowerCreditProfile;
  };
  facility: RiskFacility;
  collateral: RiskCollateral;
  policyVersion?: string;
};

export type DecisionReason = {
  code: string;
  severity: DecisionReasonSeverity;
  title: string;
  explanation: string;
  observed?: number | string | boolean;
  threshold?: number | string | boolean;
};

export type RiskPolicy = {
  version: string;
  effectiveAt: string;
  status: "provisional" | "validated";
  methodology: "transparent-scorecard-pd-lgd-ead";
  maxTotalDebtServiceRatio: number;
  minimumMonthlyResidualIncomeUsd: number;
  minimumCureMonths: number;
  rateStressBps: number;
  incomeStress: number;
  collateralAdvanceRateFloor: number;
  collateralAdvanceRateCeiling: number;
  maximumTermMonths: number;
  supportedCollateral: string[];
  supportedCreditTokens: string[];
};

export type BorrowerRiskAssessment = {
  schemaVersion: "2026-07-15";
  assessmentId: string;
  applicationId: string | null;
  generatedAt: string;
  policy: Pick<
    RiskPolicy,
    "version" | "effectiveAt" | "status" | "methodology"
  >;
  calibrationStatus: CalibrationStatus;
  recommendation: AssessmentRecommendation;
  riskBand: BorrowerRiskBand;
  riskScore: number;
  topRisks: DecisionReason[];
  reasons: DecisionReason[];
  affordability: {
    monthlyGrossIncomeUsd: number;
    monthlyNetIncomeUsd: number | null;
    proposedMonthlyPaymentUsd: number;
    stressedMonthlyPaymentUsd: number;
    totalDebtServiceRatio: number;
    monthlyResidualIncomeUsd: number;
    maxAffordablePrincipalUsd: number;
  };
  collateral: {
    spotValueUsd: number;
    liquidationValueUsd: number;
    stressedValueUsd: number;
    effectiveRecoveryValueUsd: number;
    requestedLtv: number;
    maximumLtv: number;
    stressedLtv: number;
    cureMonths: number;
    haircuts: Record<
      | "liquidity"
      | "custody"
      | "oracle"
      | "liquidationDelay"
      | "volatility"
      | "drawdown",
      number
    >;
  };
  facility: {
    requestedPrincipalUsd: number;
    supportedPrincipalUsd: number;
    counterofferPrincipalUsd: number | null;
    annualRate: number;
    durationMonths: number;
  };
  loss: {
    probabilityOfDefault: number | null;
    exposureAtDefaultUsd: number;
    lossGivenDefault: number;
    expectedLossUsd: number | null;
  };
  dataQuality: {
    complete: boolean;
    evidence: Record<"income" | "credit" | "market", EvidenceStatus>;
  };
  methodology: string[];
  warnings: string[];
};

export type BorrowerRiskScenarioRequest = {
  assessment: BorrowerRiskAssessmentRequest;
  scenarioIds?: BorrowerScenarioId[];
};

export type BorrowerRiskScenarioResult = {
  scenarioId: BorrowerScenarioId;
  label: string;
  description: string;
  base: Pick<
    BorrowerRiskAssessment,
    "recommendation" | "riskBand" | "riskScore"
  > & {
    supportedPrincipalUsd: number;
  };
  stressed: Pick<
    BorrowerRiskAssessment,
    "recommendation" | "riskBand" | "riskScore"
  > & {
    supportedPrincipalUsd: number;
    stressedLtv: number;
    monthlyResidualIncomeUsd: number;
  };
  mainRisks: DecisionReason[];
};

export type BorrowerRiskScenarioResponse = {
  generatedAt: string;
  policyVersion: string;
  results: BorrowerRiskScenarioResult[];
};
