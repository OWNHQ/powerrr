import type { BorrowerRiskAssessmentRequest } from "@powerrr/shared-types";
import { describe, expect, it } from "vitest";
import { assessBorrowerRisk, runBorrowerRiskScenarios } from "./risk.js";

const baseRequest: BorrowerRiskAssessmentRequest = {
  applicationId: "example-001",
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

describe("borrower risk assessment", () => {
  it("returns inspectable decision support without inventing probability of default", () => {
    const result = assessBorrowerRisk(baseRequest, {
      now: new Date("2026-07-15T12:00:00.000Z"),
      assessmentId: "assessment-fixed",
    });

    expect(result.assessmentId).toBe("assessment-fixed");
    expect(result.recommendation).toBe("within-policy");
    expect(result.calibrationStatus).toBe("uncalibrated");
    expect(result.loss.probabilityOfDefault).toBeNull();
    expect(result.loss.expectedLossUsd).toBeNull();
    expect(result.facility.supportedPrincipalUsd).toBeGreaterThanOrEqual(
      50_000,
    );
    expect(result.dataQuality.complete).toBe(true);
  });

  it("forces manual review when evidence is not independently verified", () => {
    const result = assessBorrowerRisk({
      ...baseRequest,
      borrower: {
        ...baseRequest.borrower,
        financials: {
          ...baseRequest.borrower.financials,
          incomeEvidence: "stated",
        },
      },
    });

    expect(result.recommendation).toBe("manual-review");
    expect(result.reasons.map((item) => item.code)).toContain(
      "INCOME_EVIDENCE_STATED",
    );
  });

  it("has no minimum affordability floor when repayment capacity is zero", () => {
    const result = assessBorrowerRisk({
      ...baseRequest,
      borrower: {
        ...baseRequest.borrower,
        financials: {
          ...baseRequest.borrower.financials,
          annualGrossIncomeUsd: 0,
          monthlyNetIncomeUsd: 0,
        },
      },
    });

    expect(result.facility.supportedPrincipalUsd).toBe(0);
    expect(result.recommendation).toBe("outside-policy");
    expect(result.reasons.map((item) => item.code)).toContain(
      "NO_REPAYMENT_INCOME",
    );
  });

  it("returns a counteroffer when verified inputs support a smaller principal", () => {
    const result = assessBorrowerRisk({
      ...baseRequest,
      facility: {
        ...baseRequest.facility,
        requestedPrincipalUsd: 80_000,
      },
    });

    expect(result.facility.counterofferPrincipalUsd).not.toBeNull();
    expect(["counteroffer", "manual-review"]).toContain(result.recommendation);
    expect(result.facility.supportedPrincipalUsd).toBeLessThan(80_000);
  });

  it("never improves capacity or risk score under adverse scenarios", () => {
    const response = runBorrowerRiskScenarios(
      {
        assessment: baseRequest,
        scenarioIds: [
          "collateral-crash",
          "income-loss",
          "rate-shock",
          "liquidity-freeze",
          "combined-stress",
        ],
      },
      {
        now: new Date("2026-07-15T12:00:00.000Z"),
        assessmentId: "scenario-fixed",
      },
    );

    expect(response.results).toHaveLength(5);
    for (const result of response.results) {
      expect(result.stressed.riskScore).toBeGreaterThanOrEqual(
        result.base.riskScore,
      );
      expect(result.stressed.supportedPrincipalUsd).toBeLessThanOrEqual(
        result.base.supportedPrincipalUsd,
      );
    }
  });

  it("makes unsupported credit tokens and very low verified FICO scores explicit", () => {
    const result = assessBorrowerRisk({
      ...baseRequest,
      borrower: {
        ...baseRequest.borrower,
        credit: {
          ...baseRequest.borrower.credit,
          creditScore: 540,
        },
      },
      facility: {
        ...baseRequest.facility,
        creditToken: "MEME",
      },
    });

    expect(result.recommendation).toBe("outside-policy");
    expect(result.reasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining([
        "CREDIT_TOKEN_UNSUPPORTED",
        "CREDIT_SCORE_VERY_LOW",
      ]),
    );
  });

  it("requires manual review when net income is missing instead of treating gross income as net", () => {
    const { monthlyNetIncomeUsd: _omitted, ...financials } =
      baseRequest.borrower.financials;
    const result = assessBorrowerRisk({
      ...baseRequest,
      borrower: {
        ...baseRequest.borrower,
        financials,
      },
    });

    expect(result.recommendation).toBe("manual-review");
    expect(result.dataQuality.complete).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toContain(
      "NET_INCOME_MISSING",
    );
  });
});
