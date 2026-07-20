import type { PortfolioAsset } from "@powerrr/shared-types";
import { describe, expect, it } from "vitest";
import { calculateOwnOpportunity } from "./opportunity.js";

const WETH: PortfolioAsset = {
  chainId: 1,
  token: "0x0000000000000000000000000000000000000001",
  symbol: "WETH",
  name: "Wrapped Ether",
  decimals: 18,
  balance: "100",
  balanceRaw: "100000000000000000000",
  marketPriceUsd: 3_000,
  protocolEligible: { own: true },
};

describe("OWN collateral-only opportunity", () => {
  it("defaults verified liquidity to zero and stays explicitly indicative", () => {
    const result = calculateOwnOpportunity([WETH]);

    expect(result.potentialBorrowUsd).toBe(149_760);
    expect(result.availableNowUsd).toBe(0);
    expect(result.fundingStatus).toBe("request-required");
    expect(result.kind).toBe("indicative-request");
    expect(result.policyVersion).toContain("own-collateral-v1");
  });

  it("reports partial and sufficient verified funding separately from capacity", () => {
    const partial = calculateOwnOpportunity([WETH], {
      availableLiquidityUsd: 50_000,
    });
    const sufficient = calculateOwnOpportunity([WETH], {
      availableLiquidityUsd: 250_000,
    });

    expect(partial).toMatchObject({
      availableNowUsd: 50_000,
      fundingStatus: "limited",
    });
    expect(sufficient).toMatchObject({
      availableNowUsd: 149_760,
      fundingStatus: "available-now",
    });
  });

  it("uses the OWN policy independently of pooled-provider matches and enforces limits", () => {
    const unsupported = calculateOwnOpportunity([
      { ...WETH, symbol: "UNI", protocolEligible: { own: false } },
    ]);
    const unapproved = calculateOwnOpportunity([
      { ...WETH, protocolEligible: {} },
    ]);
    const capped = calculateOwnOpportunity([{ ...WETH, balance: "10000" }], {
      maxTicketUsd: 120_000,
      maxFamilyContributionUsd: 150_000,
    });

    expect(unsupported).toMatchObject({
      potentialBorrowUsd: 0,
      fundingStatus: "unavailable",
    });
    expect(unapproved).toMatchObject({
      potentialBorrowUsd: 149_760,
      fundingStatus: "request-required",
    });
    expect(capped.potentialBorrowUsd).toBe(120_000);
  });
});
