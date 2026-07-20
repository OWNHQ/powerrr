import { describe, expect, it } from "vitest";
import { createEngineHttpHandler } from "./http.js";

const quoteBody = {
  chainId: 1,
  input: {
    ensName: "powerrr.eth",
  },
  mode: "wallet-estimate",
  targetBorrowAssets: ["USDC"],
  safetyProfile: "balanced",
};

const assessmentBody = {
  applicationId: "http-example",
  borrower: {
    financials: {
      annualGrossIncomeUsd: 240_000,
      monthlyNetIncomeUsd: 13_000,
      monthlyDebtPaymentsUsd: 1_500,
      monthlyLivingExpensesUsd: 4_000,
      employmentStatus: "employed",
      incomeEvidence: "verified",
    },
    credit: {
      creditScore: 760,
      creditScoreScale: "FICO 300-850",
      missedPayments24m: 0,
      defaultsOrCollections: 0,
      activeBankruptcy: false,
      creditEvidence: "verified",
    },
  },
  facility: {
    requestedPrincipalUsd: 50_000,
    annualRate: 0.12,
    durationMonths: 60,
    repaymentType: "amortizing",
    creditToken: "USDC",
  },
  collateral: {
    asset: "ETH",
    amount: 32,
    spotPriceUsd: 3_800,
    annualVolatility: 0.68,
    maxDrawdown365d: 0.62,
    volume24hUsd: 15_000_000_000,
    custodyModel: "qualified-custodian",
    oracleModel: "multi-source",
    hedgeFloorUsd: 70_000,
    marketEvidence: "verified",
  },
};

describe("engine HTTP handler", () => {
  it("serves protocol metadata through the standalone backend contract", async () => {
    const handler = createEngineHttpHandler();
    const response = await handler({
      method: "GET",
      path: "/v1/protocols",
      remoteAddress: "127.0.0.1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      protocols: expect.arrayContaining([
        expect.objectContaining({ id: "aave-v3" }),
        expect.objectContaining({ id: "compound-iii" }),
        expect.objectContaining({ id: "own" }),
      ]),
    });
  });

  it("quotes all configured protocols for a public request", async () => {
    const handler = createEngineHttpHandler();
    const response = await handler({
      method: "POST",
      path: "/v1/quotes",
      body: quoteBody,
      remoteAddress: "127.0.0.1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      resolvedEnsName: "powerrr.eth",
      quotes: expect.arrayContaining([
        expect.objectContaining({ protocolId: "compound-iii" }),
        expect.objectContaining({ protocolId: "morpho-blue" }),
      ]),
    });
  });

  it("requires signed or token auth for internal endpoints", async () => {
    const handler = createEngineHttpHandler();
    const rejected = await handler({
      method: "POST",
      path: "/v2/internal/assessments",
      body: assessmentBody,
      remoteAddress: "127.0.0.1",
    });
    const accepted = await handler({
      method: "POST",
      path: "/v2/internal/assessments",
      body: assessmentBody,
      headers: {
        "x-powerrr-internal-token": "local-dev-internal-token",
      },
      remoteAddress: "127.0.0.1",
    });

    expect(rejected.statusCode).toBe(401);
    expect(accepted.statusCode).toBe(200);
    expect(accepted.body).toMatchObject({
      applicationId: "http-example",
      policy: {
        version: "own-risk-2026-07-15",
        status: "provisional",
      },
      recommendation: expect.any(String),
      reasons: expect.any(Array),
    });
  });

  it("does not expose the retired uncalibrated v1 borrower score", async () => {
    const handler = createEngineHttpHandler();
    const response = await handler({
      method: "POST",
      path: "/v1/internal/own-risk",
      body: quoteBody,
      headers: {
        "x-powerrr-internal-token": "local-dev-internal-token",
      },
      remoteAddress: "127.0.0.1",
    });

    expect(response.statusCode).toBe(404);
  });

  it("returns structured API errors", async () => {
    const handler = createEngineHttpHandler();
    const response = await handler({
      method: "POST",
      path: "/v1/quotes",
      body: {
        chainId: 5,
        input: {
          ensName: "powerrr.eth",
        },
        mode: "wallet-estimate",
      },
      remoteAddress: "127.0.0.1",
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toMatchObject({
      error: {
        code: "INVALID_INPUT",
      },
    });
  });

  it("serves the versioned policy and explainable borrower assessment contract", async () => {
    const handler = createEngineHttpHandler({
      internalToken: "test-internal-token",
      now: () => new Date("2026-07-15T12:00:00.000Z"),
    });
    const policy = await handler({
      method: "GET",
      path: "/v2/policies/current",
      remoteAddress: "127.0.0.1",
    });
    const assessment = await handler({
      method: "POST",
      path: "/v2/internal/assessments",
      body: assessmentBody,
      headers: { "x-powerrr-internal-token": "test-internal-token" },
      remoteAddress: "127.0.0.1",
    });

    expect(policy.statusCode).toBe(200);
    expect(policy.body).toMatchObject({
      status: "provisional",
      methodology: "transparent-scorecard-pd-lgd-ead",
    });
    expect(assessment.statusCode).toBe(200);
    expect(assessment.body).toMatchObject({
      recommendation: "within-policy",
      calibrationStatus: "uncalibrated",
      loss: {
        probabilityOfDefault: null,
        expectedLossUsd: null,
      },
    });
  });

  it("returns a typed not-found response for an unknown policy version", async () => {
    const handler = createEngineHttpHandler();
    const response = await handler({
      method: "GET",
      path: "/v2/policies/unknown-version",
      remoteAddress: "127.0.0.1",
    });

    expect(response.statusCode).toBe(404);
    expect(response.body).toMatchObject({ error: { code: "INVALID_INPUT" } });
  });

  it("disables the local token fallback when production behavior is requested", async () => {
    const handler = createEngineHttpHandler({ allowLocalInternalToken: false });
    const response = await handler({
      method: "POST",
      path: "/v2/internal/assessments",
      body: assessmentBody,
      headers: { "x-powerrr-internal-token": "local-dev-internal-token" },
      remoteAddress: "127.0.0.1",
    });

    expect(response.statusCode).toBe(401);
  });
});
