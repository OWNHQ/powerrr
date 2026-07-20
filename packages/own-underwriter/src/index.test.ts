import { describe, expect, it } from "vitest";
import { normalizeUnderwriterRequest, quoteOwnUnderwriter } from "./index.js";

describe("OWN underwriter methodology", () => {
  it("approves a base mortgage-style ETH lombard quote with explanatory terms", () => {
    const quote = quoteOwnUnderwriter(
      normalizeUnderwriterRequest({
        collateral: { asset: "ETH", amount: 20 },
        credit_token: "USDC",
        duration_months: 60,
        borrower: { grade: "B", annual_income: 180_000, monthly_debt: 2_000 },
      }),
    );

    expect(quote.decision).toBe("approve");
    expect(quote.terms.maxLtv).toBeGreaterThan(0.3);
    expect(quote.terms.maxLtv).toBeLessThanOrEqual(0.5);
    expect(quote.terms.apr).toBeGreaterThan(quote.risk.fundingRate);
    expect(quote.liquidationPolicy.priceDeclineLiquidation).toBe(false);
    expect(quote.liquidationPolicy.missedPaymentTrigger).toBe(true);
    expect(quote.process).toContain(
      "Estimate PD/LGD/EAD expected loss and tail loss.",
    );
  });

  it("returns a counteroffer when requested principal exceeds model max", () => {
    const quote = quoteOwnUnderwriter(
      normalizeUnderwriterRequest({
        collateral: { asset: "ETH", amount: 10 },
        credit_token: "USDC",
        duration_months: 84,
        borrower: { grade: "C", annual_income: 120_000, monthly_debt: 2_500 },
        options_hedge: true,
        loan_amount: 35_000,
      }),
    );

    expect(quote.decision).toBe("counteroffer");
    expect(quote.terms.approvedLoanAmount).toBeLessThan(35_000);
    expect(
      quote.data.warnings.some((warning) => warning.includes("capped")),
    ).toBe(true);
  });

  it("reduces LTV and does not underprice long unhedged duration", () => {
    const hedged = quoteOwnUnderwriter(
      normalizeUnderwriterRequest({
        collateral: { asset: "ETH", amount: 30 },
        credit_token: "USDC",
        duration_months: 36,
        borrower: { grade: "A" },
        options_hedge: true,
      }),
    );
    const unhedged = quoteOwnUnderwriter(
      normalizeUnderwriterRequest({
        collateral: { asset: "ETH", amount: 30 },
        credit_token: "USDC",
        duration_months: 120,
        borrower: { grade: "A" },
        options_hedge: false,
      }),
    );

    expect(unhedged.terms.maxLtv).toBeLessThan(hedged.terms.maxLtv);
    expect(unhedged.terms.apr).toBeGreaterThanOrEqual(hedged.terms.apr - 0.01);
    expect(unhedged.hedge.source).toBe("disabled");
  });

  it("normalizes flat API aliases without dropping affordability inputs", () => {
    const request = normalizeUnderwriterRequest({
      collateralAsset: "ETH",
      collateralAmount: 15,
      creditToken: "USDC",
      durationMonths: 60,
      borrowerGrade: "B",
      annualIncomeUsd: 220_000,
      monthlyDebtUsd: 2_500,
      optionsHedge: "false",
      requestedLoanAmount: 20_000,
    });

    expect(request.borrower.annualIncome).toBe(220_000);
    expect(request.borrower.monthlyDebt).toBe(2_500);
    expect(request.optionsHedge).toBe(false);
    expect(request.loanAmount).toBe(20_000);
  });

  it("rejects invalid collateral and tenor inputs", () => {
    expect(() =>
      quoteOwnUnderwriter(
        normalizeUnderwriterRequest({
          collateral: { asset: "ETH", amount: 0 },
          credit_token: "USDC",
          duration_months: 60,
        }),
      ),
    ).toThrow("collateral amount must be positive");

    expect(() =>
      quoteOwnUnderwriter(
        normalizeUnderwriterRequest({
          collateral: { asset: "ETH", amount: 1 },
          credit_token: "USDC",
          duration_months: 361,
        }),
      ),
    ).toThrow("durationMonths must be between 3 and 360");
  });
});
