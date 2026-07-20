import { describe, expect, it } from "vitest";
import {
  createLiveSnapshotEngineDependencies,
  createPowerrrEngine,
  PowerrrEngineError,
  type LiveQuoteSnapshot,
} from "./index.js";

describe("Powerrr engine SDK", () => {
  const engine = createPowerrrEngine();

  it("resolves fixture ENS and returns all protocol quote rows", async () => {
    const response = await engine.quotes({
      chainId: 1,
      input: { ensName: "powerrr.eth" },
      mode: "wallet-estimate",
      safetyProfile: "balanced",
      targetBorrowAssets: ["USDC"],
    });

    expect(response.resolvedAddress).toMatch(/^0x/);
    expect(response.quotes).toHaveLength(6);
    expect(response.quotes[0]?.safeBorrowUsd).toBeGreaterThan(0);
    expect(response.quotes.map((quote) => quote.protocolId)).toContain(
      "aave-v3",
    );
    expect(response.quotes.map((quote) => quote.protocolId)).not.toContain(
      "own",
    );
    expect(response.opportunities?.[0]).toMatchObject({
      id: "own",
      availableNowUsd: 0,
      fundingStatus: "request-required",
    });
  });

  it("keeps existing-position mode distinct from wallet-estimate mode", async () => {
    const base = await engine.quotes({
      chainId: 1,
      input: { ensName: "existing.powerrr.eth" },
      mode: "wallet-estimate",
    });
    const existing = await engine.quotes({
      chainId: 1,
      input: { ensName: "existing.powerrr.eth" },
      mode: "existing-position",
    });

    const baseAave = base.quotes.find(
      (quote) => quote.protocolId === "aave-v3",
    );
    const existingAave = existing.quotes.find(
      (quote) => quote.protocolId === "aave-v3",
    );

    expect(baseAave?.existingDebtUsd).toBe(0);
    expect(existingAave?.existingDebtUsd).toBeGreaterThan(0);
    expect(existingAave?.safeBorrowUsd).toBeLessThan(
      baseAave?.safeBorrowUsd ?? 0,
    );
  });

  it("runs deterministic scenarios over quote outputs", async () => {
    const response = await engine.simulations({
      chainId: 1,
      input: { ensName: "powerrr.eth" },
      mode: "wallet-estimate",
      scenarioIds: ["combined-crash"],
    });

    expect(response.results.length).toBe(6);
    expect(
      response.results.every(
        (result) => result.scenarioId === "combined-crash",
      ),
    ).toBe(true);
    expect(
      response.results.every((result) => {
        if (
          result.baseSafeBorrowUsd === null ||
          result.stressedSafeBorrowUsd === null
        ) {
          return true;
        }

        return result.stressedSafeBorrowUsd <= result.baseSafeBorrowUsd;
      }),
    ).toBe(true);
  });

  it("returns OWN fixed-term risk metrics with a fully amortized ending balance", async () => {
    const response = await engine.ownRisk({
      chainId: 1,
      input: { ensName: "powerrr.eth" },
      requestedPrincipalUsd: 50_000,
      termMonths: 24,
    });

    expect(response.offeredPrincipalUsd).toBeGreaterThan(0);
    expect(response.monthlyPaymentUsd).toBeGreaterThan(0);
    expect(response.endingBalanceUsd).toBe(0);
    expect(response.metrics.map((metric) => metric.name)).toContain(
      "Stressed collateral coverage",
    );
  });

  it("raises typed SDK errors for invalid input", async () => {
    await expect(
      engine.quotes({
        chainId: 1,
        input: { ensName: "not a name" },
        mode: "wallet-estimate",
      }),
    ).rejects.toBeInstanceOf(PowerrrEngineError);
  });

  it("allows request id and clock injection without changing route contracts", async () => {
    const injected = createPowerrrEngine({
      dependencies: {
        requestId: () => "fixed-request-id",
        now: () => new Date("2026-07-01T12:00:00.000Z"),
      },
    });

    const response = await injected.quotes({
      chainId: 1,
      input: { ensName: "powerrr.eth" },
      mode: "wallet-estimate",
    });

    expect(injected.dataMode).toBe("fixtures");
    expect(response.requestId).toBe("fixed-request-id");
    expect(response.generatedAt).toBe("2026-07-01T12:00:00.000Z");
    expect(response.quotes[0]?.timestamp).toBe("2026-07-01T12:00:00.000Z");
  });

  it("fails live mode unless live SDK dependencies are supplied", () => {
    expect(() => createPowerrrEngine({ dataMode: "live" })).toThrow(
      PowerrrEngineError,
    );
    expect(() =>
      createPowerrrEngine({
        dataMode: "live",
        dependencies: {
          requestId: () => "not-enough",
        },
      }),
    ).toThrow("Live engine mode requires caller-supplied SDK dependencies");
  });

  it("quotes normalized live snapshots through SDK dependencies", async () => {
    const resolvedAddress =
      "0x5555555555555555555555555555555555555555" as const;
    const snapshots: LiveQuoteSnapshot[] = [
      {
        kind: "aave-like",
        protocolId: "aave-v3",
        protocolLabel: "Aave v3",
        familyId: "aave",
        familyLabel: "Aave",
        chainId: 1,
        mode: "wallet-estimate",
        targetBorrowAsset: "USDC",
        indicativeApr: 0.052,
        existingDebtUsd: 0,
        availableLiquidityUsd: 1_000_000,
        source: "Aave official GraphQL live dependency test",
        sourceType: "official-api",
        freshnessSeconds: 9,
        blockNumber: "23124500",
        now: new Date("2026-07-01T12:30:00.000Z"),
        assumptions: [
          "Normalized live snapshots are produced by caller-supplied protocol source clients.",
        ],
        warnings: [],
        confidencePenalties: {
          sourcePenalty: 1,
          stalenessPenalty: 1,
          fallbackPenalty: 0,
          complexityPenalty: 3,
          liquidityPenalty: 0,
        },
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
    ];
    const liveEngine = createPowerrrEngine({
      dataMode: "live",
      dependencies: createLiveSnapshotEngineDependencies({
        requestId: () => "live-request-id",
        now: () => new Date("2026-07-01T12:30:00.000Z"),
        resolveAddress: async (request) => ({
          chainId: request.chainId,
          input: request.input.address ?? "live.powerrr.eth",
          resolvedAddress,
          blockNumber: "23124500",
        }),
        getPortfolio: async (request) => ({
          resolvedAddress,
          chainId: request.chainId,
          assets: [],
          summary: {
            totalValueUsd: 0,
            eligibleCollateralUsd: 0,
            discoveredAssets: 0,
          },
          provenance: [
            {
              source: "Live portfolio dependency test",
              sourceType: "official-api",
              freshnessSeconds: 9,
              blockNumber: "23124500",
            },
          ],
          warnings: [],
        }),
        loadSnapshots: async (input) => {
          expect(input.address).toBe(resolvedAddress);
          expect(input.includeProtocols).toEqual(["aave"]);

          return {
            snapshots,
            protocolAvailability: [
              { protocolId: "aave-v3", status: "available" },
              {
                protocolId: "sparklend",
                status: "unavailable",
                reason: "Approved source read failed",
              },
            ],
          };
        },
      }),
    });

    const response = await liveEngine.quotes({
      chainId: 1,
      input: { address: resolvedAddress },
      mode: "wallet-estimate",
      includeProtocols: ["aave"],
    });

    expect(liveEngine.dataMode).toBe("live");
    expect(response.productionSafe).toBe(false);
    expect(response.sourcePolicySatisfied).toBe(true);
    expect(response.runtimeTier).toBe("public-rpc-preview");
    expect(response.requestId).toBe("live-request-id");
    expect(response.blockNumber).toBe("23124500");
    expect(response.quotes).toHaveLength(1);
    expect(response.portfolio.assets).toEqual([]);
    expect(response.protocolAvailability).toEqual([
      { protocolId: "aave-v3", status: "available" },
      {
        protocolId: "sparklend",
        status: "unavailable",
        reason: "Approved source read failed",
      },
    ]);
    expect(response.opportunities?.[0]).toMatchObject({
      id: "own",
      kind: "indicative-request",
      fundingStatus: "unavailable",
    });
    expect(response.quotes[0]).toMatchObject({
      protocolId: "aave-v3",
      safeBorrowUsd: 61_481.48,
      stale: false,
    });
  });
});
