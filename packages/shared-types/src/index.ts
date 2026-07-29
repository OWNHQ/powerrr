export type HexAddress = `0x${string}`;
export type QuoteMode = "wallet-estimate" | "existing-position";
export type RiskLevel = "low" | "medium" | "high" | "unknown";
export type Confidence = "high" | "medium" | "low";
export type SafetyProfile = "max" | "balanced" | "conservative";
export type RateType = "fixed" | "variable" | "mixed" | "unknown";
export type AnnualRateConvention = "apr" | "apy";
export type FreshnessStatus = "fresh" | "stale" | "unknown";

export type WalletProviderDescriptor = {
  uuid: string;
  name: string;
  rdns: string;
  icon?: string;
};

export type DiscoveryProgress = {
  phase: "connecting" | "balances" | "valuation" | "providers" | "complete";
  completed: number;
  total: number;
  message: string;
};

export type ReadReceipt = {
  walletName: string;
  account: HexAddress;
  chainId: 1;
  blockNumber: string;
  blockTimestamp: string;
  blockAgeSeconds: number;
  registryVersion: string;
  multicallAddress: HexAddress;
  callsAttempted: number;
  callsSucceeded: number;
  callsFailed: number;
  chunkSizes: number[];
  priceSources: string[];
  postedToPowerrr: false;
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
  balanceReadStatus?: "success" | "failed";
  balanceReadReason?: string;
  valuationStatus?: "available" | "manual-review" | "failed";
  valuationReason?: string;
  priceProvenance?: string;
  priceConfidence?: "high" | "medium" | "low";
  priceRoute?: string;
  priceObservationSeconds?: number;
  priceLiquidityUsd?: number;
  observedBlockNumber?: string;
};

export type ProtocolAssetReasonCode =
  | "INCLUDED"
  | "SUPPORTED_NOT_SELECTED"
  | "NOT_LISTED"
  | "COLLATERAL_DISABLED"
  | "INACTIVE"
  | "FROZEN"
  | "PAUSED"
  | "ISOLATION_MODE_UNMODELED"
  | "ZERO_LTV"
  | "SUPPLY_CAP_REACHED"
  | "PRICE_UNAVAILABLE"
  | "CONVERSION_REQUIRED"
  | "NO_REVIEWED_MARKET"
  | "MARKET_STATE_UNAVAILABLE"
  | "SOURCE_UNAVAILABLE";

export type ProtocolAssetEvaluation = {
  token: HexAddress;
  symbol: string;
  balanceUsd?: number;
  selectionStatus: "selected" | "not-selected" | "unselectable";
  eligibilityStatus:
    | "included"
    | "supported"
    | "unsupported"
    | "temporarily-unavailable"
    | "unknown";
  reasonCodes: ProtocolAssetReasonCode[];
  reason: string;
  ltv?: number;
  liquidationThreshold?: number;
  contributionUsd?: number;
  requiredAction?: string;
};

export type ProtocolCapacityBreakdown = {
  collateralValueUsd: number;
  protocolBorrowLimitUsd: number;
  safetyAdjustedLimitUsd: number;
  liquidityLimitUsd?: number;
  minimumBorrowUsd?: number;
  recommendedMaxUsd: number;
  bindingConstraint:
    | "collateral"
    | "safety-buffer"
    | "liquidity"
    | "minimum-borrow"
    | "no-eligible-collateral";
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
  minimumBorrowUsd?: number | null;
  targetBorrowAsset: string;
  rateType: RateType;
  indicativeApr?: number | null;
  annualRate?: AnnualRate | null;
  termMonths?: number | null;
  liquidationRisk:
    "health-factor" | "ltv-threshold" | "vault-specific" | "unknown";
  collateralUsed: CollateralUsed[];
  assetEvaluations?: ProtocolAssetEvaluation[];
  capacityBreakdown?: ProtocolCapacityBreakdown;
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

export type ProtocolAdapterInput = {
  address: HexAddress;
  chainId: number;
  mode: QuoteMode;
  portfolio: PortfolioAsset[];
  selectedCollateralTokens?: HexAddress[];
  targetBorrowAssets: string[];
  safetyProfile: SafetyProfile;
  asOfBlock?: string;
  blockTimestamp?: string;
  now?: Date;
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
    action: "open-drawer";
  };
};
