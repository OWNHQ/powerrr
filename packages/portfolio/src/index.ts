import {
  CURRENT_FIXTURE_BLOCK,
  demoAddresses,
  ensFixtures,
  portfolioFixtures,
} from "@powerrr/fixtures";
import type {
  ApiErrorCode,
  HexAddress,
  PortfolioAsset,
  PortfolioResponse,
  PortfolioSummary,
  QuoteProvenance,
  ResolveRequest,
  ResolveResponse,
} from "@powerrr/shared-types";

export class PortfolioError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = "PortfolioError";
    this.code = code;
  }
}

export function isEthereumAddress(value: string): value is HexAddress {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function normalizeAddress(value: string): HexAddress {
  if (!isEthereumAddress(value)) {
    throw new PortfolioError(
      "INVALID_INPUT",
      "Expected a valid Ethereum address",
    );
  }

  return value.toLowerCase() as HexAddress;
}

export async function resolveAddress(
  request: ResolveRequest,
): Promise<ResolveResponse> {
  if (request.chainId !== 1) {
    throw new PortfolioError(
      "UNSUPPORTED_CHAIN",
      "Only Ethereum mainnet is supported in this build",
    );
  }

  if (request.input.address) {
    return {
      chainId: request.chainId,
      input: request.input.address,
      resolvedAddress: normalizeAddress(request.input.address),
      blockNumber: CURRENT_FIXTURE_BLOCK,
    };
  }

  const ensName = request.input.ensName?.trim().toLowerCase();
  if (!ensName) {
    throw new PortfolioError(
      "INVALID_INPUT",
      "Provide either an address or ENS name",
    );
  }

  const resolvedAddress = ensFixtures[ensName as keyof typeof ensFixtures];
  if (!resolvedAddress) {
    throw new PortfolioError(
      "ENS_RESOLUTION_FAILED",
      `No fixture ENS resolution for ${ensName}`,
    );
  }

  return {
    chainId: request.chainId,
    input: ensName,
    resolvedAddress,
    resolvedEnsName: ensName,
    blockNumber: CURRENT_FIXTURE_BLOCK,
  };
}

export async function getPortfolio(
  request: ResolveRequest,
): Promise<PortfolioResponse> {
  const resolved = await resolveAddress(request);
  const assets = portfolioFixtures[resolved.resolvedAddress] ?? [];
  const summary = summarizePortfolio(assets);
  const provenance: QuoteProvenance[] = [
    {
      source: "Deterministic wallet portfolio fixture",
      sourceType: "fixture",
      freshnessSeconds: 15,
      blockNumber: CURRENT_FIXTURE_BLOCK,
    },
  ];
  const warnings =
    assets.length === 0
      ? [
          "No fixture portfolio was found for this address; quote rows will be empty or zero.",
        ]
      : [
          "Portfolio prices are discovery values only; protocol adapters use protocol-native fixture prices.",
        ];

  return {
    resolvedAddress: resolved.resolvedAddress,
    ...(resolved.resolvedEnsName
      ? { resolvedEnsName: resolved.resolvedEnsName }
      : {}),
    chainId: resolved.chainId,
    assets,
    summary,
    provenance,
    warnings,
  };
}

export function summarizePortfolio(assets: PortfolioAsset[]): PortfolioSummary {
  return assets.reduce<PortfolioSummary>(
    (summary, asset) => {
      const valueUsd = Number(asset.balance) * (asset.marketPriceUsd ?? 0);
      const eligible = Object.values(asset.protocolEligible).some(Boolean);

      return {
        totalValueUsd: round(summary.totalValueUsd + valueUsd),
        eligibleCollateralUsd: round(
          summary.eligibleCollateralUsd + (eligible ? valueUsd : 0),
        ),
        discoveredAssets: summary.discoveredAssets + 1,
        supportedWalletValueUsd: round(
          (summary.supportedWalletValueUsd ?? 0) + valueUsd,
        ),
        matchedCollateralUsd: round(
          (summary.matchedCollateralUsd ?? 0) + (eligible ? valueUsd : 0),
        ),
        matchedAssetCount:
          (summary.matchedAssetCount ?? 0) + (eligible ? 1 : 0),
      };
    },
    {
      totalValueUsd: 0,
      eligibleCollateralUsd: 0,
      discoveredAssets: 0,
      supportedWalletValueUsd: 0,
      matchedCollateralUsd: 0,
      matchedAssetCount: 0,
    },
  );
}

export function fixtureExamples(): Array<{ label: string; value: string }> {
  return [
    { label: "Diversified demo", value: "powerrr.eth" },
    { label: "Blue-chip collateral", value: "bluechip.eth" },
    { label: "Stablecoin only", value: "stablecoin.eth" },
    { label: "Existing positions", value: "existing.powerrr.eth" },
    { label: "Empty wallet", value: demoAddresses.empty },
  ];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
