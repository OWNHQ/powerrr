import type {
  BorrowOpportunity,
  CollateralUsed,
  PortfolioAsset,
} from "@powerrr/shared-types";

export const OWN_OPPORTUNITY_POLICY_VERSION =
  "own-collateral-static-v3-2026-07-21";

export type OwnOpportunityConfig = {
  availableLiquidityUsd?: number;
  indicativeApr?: number;
  termMonths?: number;
  maxTicketUsd?: number;
  maxFamilyContributionUsd?: number;
  maxNonCoreContributionUsd?: number;
  policyVersion?: string;
};

type CollateralPolicy = {
  advanceRate: number;
  haircut: number;
  family: "ETH" | "BTC" | "USD" | "NON_CORE";
  contributionCapUsd?: number;
};

const POLICY: Record<string, CollateralPolicy> = {
  WETH: { advanceRate: 0.95, haircut: 0.96, family: "ETH" },
  wstETH: { advanceRate: 0.95, haircut: 0.96, family: "ETH" },
  WBTC: { advanceRate: 0.95, haircut: 0.94, family: "BTC" },
  cbBTC: { advanceRate: 0.95, haircut: 0.94, family: "BTC" },
  USDC: { advanceRate: 0.95, haircut: 0.98, family: "USD" },
  DAI: { advanceRate: 0.95, haircut: 0.98, family: "USD" },
  USDS: { advanceRate: 0.95, haircut: 0.98, family: "USD" },
};

export function calculateOwnOpportunity(
  portfolio: PortfolioAsset[],
  config: OwnOpportunityConfig = {},
): BorrowOpportunity {
  const availableLiquidityUsd = nonNegative(config.availableLiquidityUsd ?? 0);
  const indicativeApr = bounded(config.indicativeApr ?? 0.065, 0, 1);
  const termMonths = positiveInteger(config.termMonths ?? 24, 24);
  const maxTicketUsd = nonNegative(config.maxTicketUsd ?? 750_000);
  const maxFamilyContributionUsd = nonNegative(
    config.maxFamilyContributionUsd ?? 500_000,
  );
  const maxNonCoreContributionUsd = nonNegative(
    config.maxNonCoreContributionUsd ?? 100_000,
  );
  const policyVersion = config.policyVersion ?? OWN_OPPORTUNITY_POLICY_VERSION;

  const collateralUsed: CollateralUsed[] = [];
  const familyCapacity = new Map<string, number>();

  for (const asset of portfolio) {
    const policy = policyFor(asset);
    const price = asset.marketPriceUsd;
    const balance = Number(asset.balance);
    if (
      !policy ||
      asset.protocolEligible.own === false ||
      !price ||
      !Number.isFinite(balance) ||
      balance <= 0
    ) {
      continue;
    }

    const valueUsd = roundUsd(balance * price);
    if (valueUsd <= 0) {
      continue;
    }
    const capacity = Math.min(
      valueUsd * policy.advanceRate * policy.haircut,
      policy.contributionCapUsd ?? Number.POSITIVE_INFINITY,
    );
    familyCapacity.set(
      policy.family,
      (familyCapacity.get(policy.family) ?? 0) + capacity,
    );
    collateralUsed.push({
      token: asset.token,
      symbol: asset.symbol,
      valueUsd,
      ltv: policy.advanceRate,
      liquidationThreshold: null,
    });
  }

  const concentrationAdjustedCapacity = [...familyCapacity.entries()].reduce(
    (sum, [family, capacity]) =>
      sum +
      Math.min(
        capacity,
        family === "NON_CORE"
          ? maxNonCoreContributionUsd
          : maxFamilyContributionUsd,
      ),
    0,
  );
  const potentialBorrowUsd = roundUsd(
    Math.min(maxTicketUsd, concentrationAdjustedCapacity),
  );
  const availableNowUsd = roundUsd(
    Math.min(potentialBorrowUsd, availableLiquidityUsd),
  );
  const fundingStatus: BorrowOpportunity["fundingStatus"] =
    potentialBorrowUsd <= 0
      ? "unavailable"
      : availableNowUsd <= 0
        ? "request-required"
        : availableNowUsd < potentialBorrowUsd
          ? "limited"
          : "available-now";

  return {
    id: "own",
    label: "OWN",
    rail: "own",
    kind: "indicative-request",
    potentialBorrowUsd,
    availableNowUsd,
    fundingStatus,
    indicativeApr,
    termMonths,
    collateralUsed,
    policyVersion,
    riskModel: "maturity-default",
    assumptions: [
      "Capacity is an indicative collateral-only estimate using eligible assets, published advance rates, valuation haircuts, concentration limits, and a maximum ticket.",
      "OWN terms are subject to review, lender matching, final documentation, and verified funding availability.",
      "OWN requests use a fixed duration and onchain repayment schedule rather than market-price-triggered liquidation. Failure to remain within the schedule can cause default, after which collateral can be claimed for lenders.",
    ],
    warnings:
      potentialBorrowUsd <= 0
        ? [
            "No collateral in this wallet is currently eligible under the OWN policy.",
          ]
        : availableNowUsd <= 0
          ? [
              "No committed OWN funding is currently verified. The displayed amount is not an executable quote or approval.",
            ]
          : availableNowUsd < potentialBorrowUsd
            ? [
                "Only part of the indicative capacity is covered by currently verified funding.",
              ]
            : [],
  };
}

function policyFor(asset: PortfolioAsset): CollateralPolicy | null {
  const core = POLICY[asset.symbol];
  if (core) return core;
  if (
    asset.ownEligible !== true ||
    !asset.ownAdvanceRate ||
    asset.ownValuationHaircut === undefined
  ) {
    return null;
  }
  return {
    advanceRate: bounded(asset.ownAdvanceRate, 0, 1),
    haircut: 1 - bounded(asset.ownValuationHaircut, 0, 1),
    family: "NON_CORE",
    contributionCapUsd: nonNegative(asset.ownContributionCapUsd ?? 50_000),
  };
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function bounded(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function positiveInteger(value: number, fallback: number): number {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}
