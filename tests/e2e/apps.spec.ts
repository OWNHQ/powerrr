import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("public estimator features OWN first and switches to pooled threshold risk", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Borrowing power for powerrr.eth" }),
  ).toBeVisible();
  const own = page.getByRole("radio", {
    name: /OWN Featured Request required/i,
  });
  await expect(own).toBeVisible();
  await expect(
    own.getByText("OWN’s indicative fixed-term request option"),
  ).toBeVisible();
  await expect(own.getByText("Up to $101,118")).toBeVisible();
  await expect(own).toHaveAttribute("aria-checked", "true");
  await expect(
    page.getByRole("heading", { name: "Fixed-term maturity risk" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Price changes alone do not automatically liquidate an OWN position.",
    ),
  ).toBeVisible();

  const aave = page.getByRole("radio", { name: /Aave.*Highest capacity/i });
  await aave.click();
  await expect(page.getByText("Health factor", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Borrowing power used", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Review on Aave/ }),
  ).toHaveAttribute("href", "https://app.aave.com/");
  await expect(page.getByText(/liquidation likelihood/i)).toHaveCount(0);

  const slider = page.getByRole("slider", { name: "Borrowing power used" });
  const before = Number(await slider.inputValue());
  await slider.focus();
  await slider.press("ArrowRight");
  expect(Number(await slider.inputValue())).toBeGreaterThan(before);
});

test("OWN request form is prefilled and completes through the development webhook substitute", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Request an OWN offer" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Request an OWN offer" }).click();

  const dialog = page.getByRole("dialog", { name: "Request an OWN offer" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Email address")).toBeFocused();
  await expect(dialog.getByLabel("Wallet or ENS")).toHaveValue("powerrr.eth");
  await expect(dialog.getByLabel("Requested amount (USDC)")).toHaveValue(
    "50559",
  );
  await expect(dialog.getByText("WETH · $63,510")).toBeVisible();

  await dialog.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Request an OWN offer" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Request an OWN offer" }).click();

  const reopenedDialog = page.getByRole("dialog", {
    name: "Request an OWN offer",
  });
  await reopenedDialog.getByLabel("Email address").fill("borrower@example.com");
  await reopenedDialog.getByRole("checkbox").check();
  await reopenedDialog
    .getByRole("button", { name: "Send request to OWN" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Request received" }),
  ).toBeVisible();
  await expect(
    page.getByText("This is not an approval or executable quote."),
  ).toBeVisible();
  await expect(page.getByText(/Reference [A-F0-9]{8}/)).toBeVisible();
});

test("lead endpoint validates consent, traps honeypots, and rate limits repeated submissions", async ({
  request,
}) => {
  const lead = {
    idempotencyKey: "d58e9be4-3f95-4ee4-858e-1e4f7a5d89a9",
    email: "borrower@example.com",
    wallet: "powerrr.eth",
    requestedAmountUsd: 50_000,
    creditAsset: "USDC",
    termMonths: 24,
    collateral: [{ symbol: "WETH", valueUsd: 100_000 }],
    policyVersion: "own-collateral-v1-2026-07-15",
    consent: true,
  };

  const invalid = await request.post("/api/v1/own/leads", {
    data: { ...lead, consent: false },
  });
  expect(invalid.status()).toBe(400);

  const honeypot = await request.post("/api/v1/own/leads", {
    data: { ...lead, website: "https://spam.example" },
  });
  expect(honeypot.status()).toBe(200);
  expect(await honeypot.json()).toMatchObject({
    accepted: true,
    delivery: "honeypot",
  });

  const remainingAttempts = Number(honeypot.headers()["x-ratelimit-remaining"]);
  expect(remainingAttempts).toBeGreaterThan(0);
  for (let index = 0; index < remainingAttempts; index += 1) {
    const response = await request.post("/api/v1/own/leads", {
      data: {
        ...lead,
        idempotencyKey: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      },
    });
    expect(response.status()).toBe(200);
  }

  const limited = await request.post("/api/v1/own/leads", {
    data: {
      ...lead,
      idempotencyKey: "00000000-0000-4000-8000-999999999999",
    },
  });
  expect(limited.status()).toBe(429);
});

test("public estimator remains usable at a phone viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("radio", { name: /OWN Featured Request required/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Request an OWN offer" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("disabled OWN requests leave OWN informational and select the highest-capacity live provider", async ({
  page,
}) => {
  await page.route("**/api/v1/own/leads/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        enabled: false,
        reason: "Requests are temporarily closed.",
      }),
    });
  });

  await page.goto("/");
  await expect(
    page.getByRole("radio", {
      name: /OWN Featured Unavailable.*Requests are temporarily closed/i,
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole("radio", { name: /Aave.*Highest capacity/i }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    page.getByRole("link", { name: /Review on Aave/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Request an OWN offer" }),
  ).toHaveCount(0);
});

test("mocked live ENS results show conversions and partial provider availability on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v2/quotes", async (route) => {
    const portfolio = {
      resolvedAddress: "0x1111111111111111111111111111111111111111",
      resolvedEnsName: "vojtch.eth",
      chainId: 1,
      assets: [
        {
          chainId: 1,
          token: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
          symbol: "ETH",
          name: "Ether",
          decimals: 18,
          balance: "1",
          balanceRaw: "1000000000000000000",
          marketPriceUsd: 2_000,
          protocolEligible: { "aave-v3": true },
          assetKind: "native",
          protocolAssetToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
          protocolBalanceRaw: "1000000000000000000",
          requiredAction: "wrap",
          conversion: {
            kind: "one-to-one",
            fromSymbol: "ETH",
            toSymbol: "WETH",
            rate: "1",
          },
        },
      ],
      summary: {
        totalValueUsd: 2_000,
        eligibleCollateralUsd: 2_000,
        discoveredAssets: 1,
        supportedWalletValueUsd: 2_000,
        matchedCollateralUsd: 2_000,
        matchedAssetCount: 1,
      },
      provenance: [
        {
          source: "Ethereum RPC batch test",
          sourceType: "on-chain",
          blockNumber: "1",
        },
      ],
      warnings: ["Unsupported wallet holdings are intentionally omitted."],
    };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        requestId: "live-e2e",
        resolvedAddress: portfolio.resolvedAddress,
        resolvedEnsName: "vojtch.eth",
        chainId: 1,
        mode: "wallet-estimate",
        blockNumber: "1",
        blockTimestamp: "2026-07-20T07:59:48.000Z",
        calculatedAt: "2026-07-20T08:00:00.000Z",
        servedAt: "2026-07-20T08:00:01.000Z",
        generatedAt: "2026-07-20T08:00:00.000Z",
        dataMode: "live",
        runtimeTier: "public-rpc-preview",
        sourcePolicySatisfied: true,
        completeness: "partial",
        cache: { status: "miss", ageSeconds: 0 },
        observations: [
          {
            sourceId: "portfolio:0",
            sourceLabel: "Ethereum RPC batch test",
            sourceType: "on-chain",
            fetchedAt: "2026-07-20T08:00:00.000Z",
            observedAt: "2026-07-20T07:59:48.000Z",
            blockNumber: "1",
            blockTimestamp: "2026-07-20T07:59:48.000Z",
            ageSeconds: 12,
            freshness: "fresh",
          },
        ],
        productionSafe: false,
        quotes: [],
        opportunities: [],
        portfolio,
        portfolioSummary: portfolio.summary,
        protocolAvailability: [
          {
            protocolId: "aave-v3",
            status: "unavailable",
            code: "SOURCE_READ_FAILED",
            reason: "Live estimate temporarily unavailable",
          },
        ],
        warnings: ["Live estimates use public-rpc-preview infrastructure."],
      }),
    });
  });

  await page.goto("/");
  await expect(page.getByText("Wrapping required")).toHaveCount(0);
  await page.getByText("About this estimate").click();
  await expect(
    page.getByText(/Some providers may require converting ETH or stETH/i),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", {
      name: /Aave.*Live estimate temporarily unavailable/i,
    }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("empty and server-error states are clear", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "powerrr.eth" }).click();
  await page.getByLabel("Ethereum address or ENS").fill("empty.powerrr.eth");
  await page.getByRole("button", { name: "Update" }).click();
  await expect(
    page.getByRole("heading", { name: "No provider-matched collateral" }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: /OWN Featured Unavailable/i }),
  ).toHaveCount(0);

  await page.route("**/api/v2/quotes", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "PROTOCOL_SOURCE_UNAVAILABLE",
          message: "Live provider data is temporarily unavailable.",
        },
      }),
    });
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "We couldn’t estimate this wallet" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Live provider data is temporarily unavailable/),
  ).toBeVisible();
});

test("invalid ENS errors stay friendly and retry returns focus to the preserved wallet input", async ({
  page,
}) => {
  await page.route("**/api/v2/quotes", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "ENS_RESOLUTION_FAILED",
          message:
            "ContractFunctionExecutionError: resolveWithGateways(0xdeadbeef) reverted",
        },
      }),
    });
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "We couldn’t estimate this wallet" }),
  ).toBeVisible();
  await expect(page.getByText(/couldn’t resolve that ENS name/i)).toBeVisible();
  await expect(
    page.getByText(
      /resolveWithGateways|0xdeadbeef|ContractFunctionExecutionError/,
    ),
  ).toHaveCount(0);

  await page
    .getByRole("button", { name: "Clear error and edit address" })
    .click();
  const walletInput = page.getByLabel("Ethereum address or ENS");
  await expect(walletInput).toBeFocused();
  await expect(walletInput).toHaveValue("powerrr.eth");
});

test("the amount input and slider agree for a sub-dollar borrowing maximum", async ({
  page,
}) => {
  await page.route("**/api/v2/quotes", async (route) => {
    const portfolio = {
      resolvedAddress: "0x1111111111111111111111111111111111111111",
      resolvedEnsName: "tiny.eth",
      chainId: 1,
      assets: [
        {
          chainId: 1,
          token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
          symbol: "WETH",
          name: "Wrapped Ether",
          decimals: 18,
          balance: "0.0001",
          balanceRaw: "100000000000000",
          marketPriceUsd: 45,
          protocolEligible: { "aave-v3": true },
          assetKind: "erc20",
        },
      ],
      summary: {
        totalValueUsd: 0.0045,
        eligibleCollateralUsd: 0.0045,
        discoveredAssets: 1,
        supportedWalletValueUsd: 0.0045,
        matchedCollateralUsd: 0.0045,
        matchedAssetCount: 1,
      },
      provenance: [{ source: "Tiny wallet fixture", sourceType: "fixture" }],
      warnings: [],
    };
    const quote = {
      protocolId: "aave-v3",
      protocolLabel: "Aave V3",
      familyId: "aave",
      familyLabel: "Aave",
      chainId: 1,
      mode: "wallet-estimate",
      theoreticalBorrowUsd: 1,
      safeBorrowUsd: 0.93,
      existingDebtUsd: 0,
      availableLiquidityUsd: 1_000,
      targetBorrowAsset: "USDC",
      rateType: "variable",
      indicativeApr: 0.04,
      annualRate: {
        value: 0.04,
        convention: "apr",
        rateType: "variable",
        sourceId: "aave-v3",
      },
      liquidationRisk: "price-threshold",
      collateralUsed: [
        {
          token: portfolio.assets[0].token,
          symbol: "WETH",
          valueUsd: 1,
          ltv: 0.8,
          liquidationThreshold: 0.83,
        },
      ],
      healthFactor: 1.4,
      riskLevel: "medium",
      confidence: "high",
      confidenceScore: 0.95,
      stale: false,
      timestamp: "2026-07-20T08:00:00.000Z",
      assumptions: [],
      warnings: [],
      provenance: [{ source: "Tiny wallet fixture", sourceType: "fixture" }],
    };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        requestId: "tiny-e2e",
        resolvedAddress: portfolio.resolvedAddress,
        resolvedEnsName: "tiny.eth",
        chainId: 1,
        mode: "wallet-estimate",
        blockNumber: "1",
        calculatedAt: "2026-07-20T08:00:00.000Z",
        servedAt: "2026-07-20T08:00:00.000Z",
        generatedAt: "2026-07-20T08:00:00.000Z",
        dataMode: "fixtures",
        runtimeTier: "fixture",
        sourcePolicySatisfied: false,
        completeness: "complete",
        cache: { status: "miss", ageSeconds: 0 },
        observations: [
          {
            sourceId: "portfolio:0",
            sourceLabel: "Tiny wallet fixture",
            sourceType: "fixture",
            fetchedAt: "2026-07-20T08:00:00.000Z",
            freshness: "fresh",
            ageSeconds: 0,
          },
        ],
        productionSafe: false,
        quotes: [quote],
        opportunities: [],
        portfolio,
        portfolioSummary: portfolio.summary,
        protocolAvailability: [{ protocolId: "aave-v3", status: "available" }],
        warnings: [],
      }),
    });
  });

  await page.goto("/");
  await expect(
    page.getByRole("radio", {
      name: /Aave.*Estimated borrowing power.*\$0.93/i,
    }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    page
      .getByRole("region", { name: "Provider-matched collateral" })
      .getByText("<$0.01"),
  ).toBeVisible();

  const amount = page.getByLabel("Borrow amount (USDC)");
  const slider = page.getByRole("slider", { name: "Borrowing power used" });
  await expect(amount).toHaveValue("0.47");
  await expect(slider).toHaveValue("51");
  await page.getByRole("button", { name: /Max.*\$0.93/ }).click();
  await expect(amount).toHaveValue("0.93");
  await expect(slider).toHaveValue("100");
});

test("the public result has no automatically detectable WCAG A or AA violations", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Borrowing power for powerrr.eth" }),
  ).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});

test("internal workbench gates unverified evidence and runs all stresses", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:3001");
  await expect(
    page.getByRole("heading", { name: "Powerrr Risk" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "within policy" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Unverified evidence" }).click();
  await expect(
    page.getByRole("heading", { name: "manual review" }),
  ).toBeVisible();
  await expect(page.getByText("Evidence review required")).toBeVisible();
  await page.getByRole("button", { name: "Run all stresses" }).click();
  await expect(
    page.getByRole("heading", { name: "Stress scenarios" }),
  ).toBeVisible();
  await expect(page.locator(".scenario-row")).toHaveCount(5);
});
