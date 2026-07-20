import { describe, expect, it } from "vitest";
import { OwnLeadRequestSchema } from "./index.js";

const validLead = {
  idempotencyKey: "d58e9be4-3f95-4ee4-858e-1e4f7a5d89a9",
  email: "borrower@example.com",
  wallet: "powerrr.eth",
  requestedAmountUsd: 50_000,
  creditAsset: "USDC",
  termMonths: 24,
  collateral: [{ symbol: "WETH", valueUsd: 100_000 }],
  policyVersion: "own-collateral-v1",
  consent: true,
};

describe("OWN lead request schema", () => {
  it("requires valid contact details and explicit consent", () => {
    expect(OwnLeadRequestSchema.safeParse(validLead).success).toBe(true);
    expect(
      OwnLeadRequestSchema.safeParse({ ...validLead, email: "not-an-email" })
        .success,
    ).toBe(false);
    expect(
      OwnLeadRequestSchema.safeParse({ ...validLead, consent: false }).success,
    ).toBe(false);
  });

  it("accepts the honeypot field so the route can reject bots without forwarding", () => {
    expect(
      OwnLeadRequestSchema.safeParse({
        ...validLead,
        website: "https://spam.example",
      }).success,
    ).toBe(true);
  });
});
