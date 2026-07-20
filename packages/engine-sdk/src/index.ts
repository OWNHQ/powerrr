import {
  getPortfolio as fixtureGetPortfolio,
  PortfolioError,
  resolveAddress as fixtureResolveAddress,
} from "@powerrr/portfolio";
import {
  calculateOwnRiskResponse as fixtureCalculateOwnRiskResponse,
  getProtocolMetadata as fixtureGetProtocolMetadata,
  quoteLiveSnapshots,
  quoteAllProtocols as fixtureQuoteAllProtocols,
  runDeterministicScenarios as fixtureRunDeterministicScenarios,
  type LiveQuoteSnapshot,
} from "@powerrr/protocol-adapters";
import {
  assessBorrowerRisk as calculateBorrowerRiskAssessment,
  calculateOwnOpportunity,
  getRiskPolicy as loadRiskPolicy,
  runBorrowerRiskScenarios as calculateBorrowerRiskScenarios,
  type OwnOpportunityConfig,
} from "@powerrr/own-underwriter";
import {
  BorrowerRiskAssessmentRequestSchema,
  BorrowerRiskScenarioRequestSchema,
  OwnRiskRequestSchema,
  PortfolioRequestSchema,
  QuoteRequestSchema,
  ResolveRequestSchema,
  SimulationRequestSchema,
} from "@powerrr/schemas";
import type {
  ApiError,
  ApiErrorCode,
  BorrowOpportunity,
  BorrowerRiskAssessment,
  BorrowerRiskAssessmentRequest,
  BorrowerRiskScenarioRequest,
  BorrowerRiskScenarioResponse,
  OwnRiskRequest,
  OwnRiskResponse,
  PortfolioRequest,
  PortfolioResponse,
  ProtocolAvailability,
  ProtocolAdapterInput,
  ProtocolBorrowQuote,
  ProtocolMetadata,
  QuoteRequest,
  QuoteResponse,
  ResolveRequest,
  ResolveResponse,
  RiskPolicy,
  RuntimeTier,
  SimulationRequest,
  SimulationResponse,
  SourceObservation,
} from "@powerrr/shared-types";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";

export type PowerrrEngineDataMode = "fixtures" | "live";

export type PowerrrEngineDependencies = {
  resolveAddress(request: ResolveRequest): Promise<ResolveResponse>;
  getPortfolio(
    request: PortfolioRequest,
    resolved?: ResolveResponse,
  ): Promise<PortfolioResponse>;
  getProtocolMetadata(): ProtocolMetadata[];
  quoteAllProtocols(
    input: ProtocolAdapterInput & {
      includeProtocols?: string[];
    },
  ): Promise<ProtocolBorrowQuote[] | ProtocolQuoteExecution>;
  calculateOwnRiskResponse(input: {
    address: `0x${string}`;
    chainId: number;
    portfolio: PortfolioResponse["assets"];
    requestedPrincipalUsd?: number;
    termMonths?: 12 | 24 | 36;
  }): OwnRiskResponse;
  getBorrowOpportunities(
    portfolio: PortfolioResponse["assets"],
  ): BorrowOpportunity[];
  runDeterministicScenarios(
    input: Parameters<typeof fixtureRunDeterministicScenarios>[0],
  ): ReturnType<typeof fixtureRunDeterministicScenarios>;
  assessBorrowerRisk(
    request: BorrowerRiskAssessmentRequest,
    options: { now: Date; assessmentId: string },
  ): BorrowerRiskAssessment;
  runBorrowerRiskScenarios(
    request: BorrowerRiskScenarioRequest,
    options: { now: Date; assessmentId: string },
  ): BorrowerRiskScenarioResponse;
  getRiskPolicy(version?: string): RiskPolicy;
  requestId(): string;
  now(): Date;
};

export type PowerrrEngineOptions = {
  dataMode?: PowerrrEngineDataMode;
  runtimeTier?: RuntimeTier;
  ownOpportunityConfig?: OwnOpportunityConfig;
  dependencies?: Partial<PowerrrEngineDependencies>;
};

export type LiveSnapshotEngineDependencies = Pick<
  PowerrrEngineDependencies,
  "resolveAddress" | "getPortfolio"
> &
  Partial<
    Omit<
      PowerrrEngineDependencies,
      "resolveAddress" | "getPortfolio" | "quoteAllProtocols"
    >
  > & {
    loadSnapshots(
      input: ProtocolAdapterInput & { includeProtocols?: string[] },
    ): Promise<LiveSnapshotExecution | LiveQuoteSnapshot[]>;
  };

export type ProtocolQuoteExecution = {
  quotes: ProtocolBorrowQuote[];
  protocolAvailability: ProtocolAvailability[];
};

export type LiveSnapshotExecution = {
  snapshots: LiveQuoteSnapshot[];
  protocolAvailability: ProtocolAvailability[];
};

export class PowerrrEngineError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(
    code: ApiErrorCode,
    message: string,
    statusCode = 400,
    details?: unknown,
  ) {
    super(message);
    this.name = "PowerrrEngineError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  toApiError(): ApiError {
    return {
      code: this.code,
      message: this.message,
      ...(this.details === undefined ? {} : { details: this.details }),
    };
  }
}

export type PowerrrEngine = ReturnType<typeof createPowerrrEngine>;

export function createPowerrrEngine(options: PowerrrEngineOptions = {}) {
  const dataMode = options.dataMode ?? "fixtures";
  const runtimeTier =
    options.runtimeTier ??
    (dataMode === "live" ? "public-rpc-preview" : "fixture");
  assertLiveDependencies(dataMode, options.dependencies ?? {});
  const dependencies: PowerrrEngineDependencies = {
    resolveAddress: fixtureResolveAddress,
    getPortfolio: fixtureGetPortfolio,
    getProtocolMetadata: fixtureGetProtocolMetadata,
    quoteAllProtocols: async (input) =>
      (await fixtureQuoteAllProtocols(input)).filter(
        (quote) => quote.protocolId !== "own",
      ),
    calculateOwnRiskResponse: fixtureCalculateOwnRiskResponse,
    getBorrowOpportunities: (portfolio) => [
      calculateOwnOpportunity(portfolio, options.ownOpportunityConfig),
    ],
    runDeterministicScenarios: fixtureRunDeterministicScenarios,
    assessBorrowerRisk: calculateBorrowerRiskAssessment,
    runBorrowerRiskScenarios: calculateBorrowerRiskScenarios,
    getRiskPolicy: loadRiskPolicy,
    requestId: randomUUID,
    now: () => new Date(),
    ...options.dependencies,
  };

  return {
    dataMode,

    async health() {
      return {
        ok: true,
        dataMode,
      };
    },

    async version() {
      return {
        name: "powerrr-engine-sdk",
        version: "0.0.0",
        schemaVersion: "2026-07-15",
        dataMode,
      };
    },

    async protocols(): Promise<{ protocols: ProtocolMetadata[] }> {
      return {
        protocols: dependencies.getProtocolMetadata(),
      };
    },

    async riskPolicy(version?: string): Promise<RiskPolicy> {
      return wrapErrors(async () => {
        try {
          return dependencies.getRiskPolicy(version);
        } catch (error) {
          throw new PowerrrEngineError(
            "INVALID_INPUT",
            error instanceof Error
              ? error.message
              : "Risk policy version was not found",
            404,
            { requestedVersion: version ?? "current" },
          );
        }
      });
    },

    async assessBorrowerRisk(
      request: BorrowerRiskAssessmentRequest,
    ): Promise<BorrowerRiskAssessment> {
      return wrapErrors(async () => {
        const body = BorrowerRiskAssessmentRequestSchema.parse(
          request,
        ) as BorrowerRiskAssessmentRequest;
        return dependencies.assessBorrowerRisk(body, {
          now: dependencies.now(),
          assessmentId: dependencies.requestId(),
        });
      });
    },

    async borrowerRiskScenarios(
      request: BorrowerRiskScenarioRequest,
    ): Promise<BorrowerRiskScenarioResponse> {
      return wrapErrors(async () => {
        const body = BorrowerRiskScenarioRequestSchema.parse(
          request,
        ) as BorrowerRiskScenarioRequest;
        return dependencies.runBorrowerRiskScenarios(body, {
          now: dependencies.now(),
          assessmentId: dependencies.requestId(),
        });
      });
    },

    async resolve(request: ResolveRequest): Promise<ResolveResponse> {
      return wrapErrors(async () =>
        dependencies.resolveAddress(ResolveRequestSchema.parse(request)),
      );
    },

    async portfolio(request: PortfolioRequest): Promise<PortfolioResponse> {
      return wrapErrors(async () =>
        dependencies.getPortfolio(PortfolioRequestSchema.parse(request)),
      );
    },

    async quotes(request: QuoteRequest): Promise<QuoteResponse> {
      return wrapErrors(async () => {
        const body = QuoteRequestSchema.parse(request);
        const resolved = await dependencies.resolveAddress(body);
        const portfolio = await dependencies.getPortfolio(body, resolved);
        const generatedAt = dependencies.now();
        const execution = normalizeQuoteExecution(
          await dependencies.quoteAllProtocols({
            address: resolved.resolvedAddress,
            chainId: body.chainId,
            mode: body.mode,
            portfolio: portfolio.assets,
            targetBorrowAssets: body.targetBorrowAssets ?? ["USDC"],
            safetyProfile: body.safetyProfile ?? "balanced",
            ...((body.asOfBlock ?? resolved.blockNumber)
              ? { asOfBlock: body.asOfBlock ?? resolved.blockNumber }
              : {}),
            ...(resolved.blockTimestamp
              ? { blockTimestamp: resolved.blockTimestamp }
              : {}),
            now: generatedAt,
            ...(body.includeProtocols
              ? { includeProtocols: body.includeProtocols }
              : {}),
          }),
        );
        const quotes = execution.quotes;
        if (dataMode === "live") {
          assertProductionSafeQuotes(quotes);
        }
        const sourcePolicySatisfied =
          dataMode === "live" && hasOnlyApprovedSources(quotes);
        const completeness = execution.protocolAvailability.every(
          (item) => item.status === "available",
        )
          ? "complete"
          : "partial";
        const portfolioWithMatches = applyConfirmedMatches(portfolio, quotes);
        const portfolioSummary = summarizeConfirmedPortfolio(
          portfolioWithMatches.assets,
        );
        const observations = collectSourceObservations(
          portfolioWithMatches,
          quotes,
          generatedAt,
        );
        const calculatedAt = generatedAt.toISOString();

        return {
          requestId: dependencies.requestId(),
          resolvedAddress: resolved.resolvedAddress,
          ...(resolved.resolvedEnsName
            ? { resolvedEnsName: resolved.resolvedEnsName }
            : {}),
          chainId: body.chainId,
          mode: body.mode,
          blockNumber: resolved.blockNumber ?? "unknown",
          ...(resolved.blockTimestamp
            ? { blockTimestamp: resolved.blockTimestamp }
            : {}),
          calculatedAt,
          servedAt: calculatedAt,
          generatedAt: calculatedAt,
          dataMode,
          runtimeTier,
          sourcePolicySatisfied,
          completeness,
          cache: {
            status: "miss",
            ageSeconds: 0,
          },
          productionSafe:
            runtimeTier === "production" &&
            sourcePolicySatisfied &&
            completeness === "complete",
          observations,
          quotes,
          opportunities: dependencies.getBorrowOpportunities(
            portfolioWithMatches.assets,
          ),
          portfolio: {
            ...portfolioWithMatches,
            summary: portfolioSummary,
          },
          portfolioSummary,
          protocolAvailability: execution.protocolAvailability,
          warnings:
            dataMode === "live"
              ? [
                  ...portfolio.warnings,
                  "Live estimates use public-rpc-preview infrastructure with no availability guarantee.",
                ]
              : portfolio.warnings,
        };
      });
    },

    async ownRisk(request: OwnRiskRequest): Promise<OwnRiskResponse> {
      return wrapErrors(async () => {
        const body = OwnRiskRequestSchema.parse(request);
        const resolved = await dependencies.resolveAddress(body);
        const portfolio = await dependencies.getPortfolio(body, resolved);

        return dependencies.calculateOwnRiskResponse({
          address: resolved.resolvedAddress,
          chainId: body.chainId,
          portfolio: portfolio.assets,
          ...(body.requestedPrincipalUsd
            ? { requestedPrincipalUsd: body.requestedPrincipalUsd }
            : {}),
          ...(body.termMonths ? { termMonths: body.termMonths } : {}),
        });
      });
    },

    async simulations(request: SimulationRequest): Promise<SimulationResponse> {
      return wrapErrors(async () => {
        const body = SimulationRequestSchema.parse(request);
        const resolved = await dependencies.resolveAddress(body);
        const portfolio = await dependencies.getPortfolio(body, resolved);
        const generatedAt = dependencies.now();
        const execution = normalizeQuoteExecution(
          await dependencies.quoteAllProtocols({
            address: resolved.resolvedAddress,
            chainId: body.chainId,
            mode: body.mode,
            portfolio: portfolio.assets,
            targetBorrowAssets: body.targetBorrowAssets ?? ["USDC"],
            safetyProfile: body.safetyProfile ?? "balanced",
            ...((body.asOfBlock ?? resolved.blockNumber)
              ? { asOfBlock: body.asOfBlock ?? resolved.blockNumber }
              : {}),
            ...(resolved.blockTimestamp
              ? { blockTimestamp: resolved.blockTimestamp }
              : {}),
            now: generatedAt,
            ...(body.includeProtocols
              ? { includeProtocols: body.includeProtocols }
              : {}),
          }),
        );
        const quotes = execution.quotes;
        if (dataMode === "live") {
          assertProductionSafeQuotes(quotes);
        }

        return {
          requestId: dependencies.requestId(),
          resolvedAddress: resolved.resolvedAddress,
          generatedAt: generatedAt.toISOString(),
          results: dependencies.runDeterministicScenarios({
            quotes,
            ...(body.scenarioIds ? { scenarioIds: body.scenarioIds } : {}),
          }),
          assumptions:
            dataMode === "live"
              ? [
                  "Deterministic standardized shocks are applied to live protocol quote inputs.",
                  "Scenario results are decision support and are not transaction or liquidation previews.",
                ]
              : [
                  "Deterministic scenarios use fixture shocks and should not be treated as live execution previews.",
                  "Protocol quote inputs use fixture-mode protocol-native parameters.",
                ],
        };
      });
    },
  };
}

export function createLiveSnapshotEngineDependencies(
  input: LiveSnapshotEngineDependencies,
): Partial<PowerrrEngineDependencies> {
  return {
    ...input,
    quoteAllProtocols: async (quoteInput) => {
      const loaded = await input.loadSnapshots(quoteInput);
      const execution = Array.isArray(loaded)
        ? {
            snapshots: loaded,
            protocolAvailability: loaded.map((snapshot) => ({
              protocolId: snapshot.protocolId,
              status: "available" as const,
            })),
          }
        : loaded;

      return {
        quotes: quoteLiveSnapshots({
          snapshots: execution.snapshots,
          ...(quoteInput.includeProtocols
            ? { includeProtocols: quoteInput.includeProtocols }
            : {}),
        }),
        protocolAvailability: execution.protocolAvailability,
      };
    },
  };
}

export type { LiveQuoteSnapshot };

export function toPowerrrEngineError(error: unknown): PowerrrEngineError {
  if (error instanceof PowerrrEngineError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new PowerrrEngineError(
      "INVALID_INPUT",
      "Request validation failed",
      400,
      error.flatten(),
    );
  }

  if (error instanceof PortfolioError) {
    return new PowerrrEngineError(
      error.code,
      error.message,
      statusForError(error.code),
    );
  }

  return new PowerrrEngineError(
    "INTERNAL_ERROR",
    "Unexpected engine SDK error",
    500,
  );
}

async function wrapErrors<T>(callback: () => Promise<T>): Promise<T> {
  try {
    return await callback();
  } catch (error) {
    throw toPowerrrEngineError(error);
  }
}

function statusForError(code: ApiErrorCode): number {
  if (code === "UNSUPPORTED_CHAIN") {
    return 422;
  }

  if (code === "ENS_RESOLUTION_FAILED") {
    return 404;
  }

  return 400;
}

function assertLiveDependencies(
  dataMode: PowerrrEngineDataMode,
  dependencies: Partial<PowerrrEngineDependencies>,
): void {
  if (dataMode !== "live") {
    return;
  }

  const required = [
    "resolveAddress",
    "getPortfolio",
    "quoteAllProtocols",
  ] as const;
  const missing = required.filter((key) => dependencies[key] === undefined);
  if (missing.length === 0) {
    return;
  }

  throw new PowerrrEngineError(
    "PROTOCOL_SOURCE_UNAVAILABLE",
    "Live engine mode requires caller-supplied SDK dependencies for address resolution, portfolio discovery, and protocol quotes",
    503,
    {
      missingDependencyKeys: missing,
    },
  );
}

function assertProductionSafeQuotes(quotes: ProtocolBorrowQuote[]): void {
  const unsafe = quotes.flatMap((quote) =>
    quote.provenance
      .filter(
        (item) =>
          item.sourceType === "fixture" ||
          item.sourceType === "assumption" ||
          item.sourceType === "fallback",
      )
      .map((item) => ({
        protocolId: quote.protocolId,
        source: item.source,
        sourceType: item.sourceType,
      })),
  );

  if (unsafe.length > 0) {
    throw new PowerrrEngineError(
      "PROTOCOL_SOURCE_UNAVAILABLE",
      "Live mode refused quote data derived from fixtures or unapproved assumptions",
      503,
      { unsafeSources: unsafe },
    );
  }
}

function hasOnlyApprovedSources(quotes: ProtocolBorrowQuote[]): boolean {
  return quotes.every((quote) =>
    quote.provenance.every(
      (item) =>
        item.sourceType === "official-api" || item.sourceType === "on-chain",
    ),
  );
}

function applyConfirmedMatches(
  portfolio: PortfolioResponse,
  quotes: ProtocolBorrowQuote[],
): PortfolioResponse {
  return {
    ...portfolio,
    assets: portfolio.assets.map((asset) => {
      const protocolEligible: Record<string, boolean> = {};
      for (const quote of quotes) {
        const matches = quote.collateralUsed.some(
          (collateral) =>
            collateral.valueUsd > 0 &&
            (collateral.token.toLowerCase() === asset.token.toLowerCase() ||
              collateral.token.toLowerCase() ===
                asset.protocolAssetToken?.toLowerCase()),
        );
        if (matches) {
          protocolEligible[quote.protocolId] = true;
        }
      }

      return {
        ...asset,
        protocolEligible,
      };
    }),
  };
}

function summarizeConfirmedPortfolio(
  assets: PortfolioResponse["assets"],
): PortfolioResponse["summary"] {
  const matched = assets.filter((asset) =>
    Object.values(asset.protocolEligible).some(Boolean),
  );
  const valueOf = (asset: PortfolioResponse["assets"][number]) => {
    const value = Number(asset.balance) * (asset.marketPriceUsd ?? 0);
    return Number.isFinite(value) ? value : 0;
  };
  const supportedWalletValueUsd = roundUsd(
    assets.reduce((sum, asset) => sum + valueOf(asset), 0),
  );
  const matchedCollateralUsd = roundUsd(
    matched.reduce((sum, asset) => sum + valueOf(asset), 0),
  );

  return {
    totalValueUsd: supportedWalletValueUsd,
    eligibleCollateralUsd: matchedCollateralUsd,
    discoveredAssets: assets.length,
    supportedWalletValueUsd,
    matchedCollateralUsd,
    matchedAssetCount: matched.length,
  };
}

function collectSourceObservations(
  portfolio: PortfolioResponse,
  quotes: ProtocolBorrowQuote[],
  now: Date,
): SourceObservation[] {
  const rows = [
    ...portfolio.provenance.map((item, index) => ({
      sourceId: `portfolio:${index}`,
      item,
    })),
    ...quotes.flatMap((quote) =>
      quote.provenance.map((item, index) => ({
        sourceId: `${quote.protocolId}:${index}`,
        item,
      })),
    ),
  ];

  return rows.map(({ sourceId, item }) => ({
    sourceId,
    sourceLabel: item.source,
    sourceType: item.sourceType,
    fetchedAt: item.fetchedAt ?? now.toISOString(),
    ...(item.observedAt ? { observedAt: item.observedAt } : {}),
    ...(item.blockNumber ? { blockNumber: item.blockNumber } : {}),
    ...(item.blockTimestamp ? { blockTimestamp: item.blockTimestamp } : {}),
    ...(item.freshnessSeconds === undefined
      ? {}
      : { ageSeconds: item.freshnessSeconds }),
    freshness:
      item.freshnessStatus ??
      (item.freshnessSeconds === undefined
        ? "unknown"
        : item.freshnessSeconds > 60
          ? "stale"
          : "fresh"),
  }));
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeQuoteExecution(
  result: ProtocolBorrowQuote[] | ProtocolQuoteExecution,
): ProtocolQuoteExecution {
  if (!Array.isArray(result)) {
    return result;
  }

  return {
    quotes: result,
    protocolAvailability: result.map((quote) => ({
      protocolId: quote.protocolId,
      status: "available" as const,
    })),
  };
}
