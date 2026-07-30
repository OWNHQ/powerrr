import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { encodeFunctionData, encodeFunctionResult, parseAbi } from "viem";
import { ethereumTokenRegistryV1 } from "../../packages/configs/src/index.ts";
import {
  ENS_UNIVERSAL_RESOLVER,
  GNS_NAME_NFT,
} from "../../apps/website/utils/static-names.ts";

const account = "0x00000000000000000000000000000000000000A1";
const wethIndex = ethereumTokenRegistryV1.findIndex(
  (token) => token.symbol === "WETH",
);
const unpricedIndex = ethereumTokenRegistryV1.findIndex(
  (token) => token.priceRoute.kind === "automatic-onchain",
);
const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as const;
const usdc = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as const;
const aUsdc = "0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c" as const;
const zero = "0x0000000000000000000000000000000000000000" as const;

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
] as const;
const oracleAbi = [
  {
    type: "function",
    name: "BASE_CURRENCY_UNIT",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "unit", type: "uint256" }],
  },
  {
    type: "function",
    name: "getAssetPrice",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [{ name: "price", type: "uint256" }],
  },
] as const;
const multicall3Abi = [
  {
    type: "function",
    name: "aggregate3",
    stateMutability: "payable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "allowFailure", type: "bool" },
          { name: "callData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      {
        name: "returnData",
        type: "tuple[]",
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" },
        ],
      },
    ],
  },
] as const;
const ensReverseAbi = [
  {
    type: "function",
    name: "reverse",
    stateMutability: "view",
    inputs: [
      { name: "lookupAddress", type: "bytes" },
      { name: "coinType", type: "uint256" },
    ],
    outputs: [
      { name: "primary", type: "string" },
      { name: "resolver", type: "address" },
      { name: "reverseResolver", type: "address" },
    ],
  },
] as const;
const gnsReverseAbi = [
  {
    type: "function",
    name: "reverseResolve",
    stateMutability: "view",
    inputs: [{ name: "addr", type: "address" }],
    outputs: [{ name: "name", type: "string" }],
  },
] as const;
const aaveDataAbi = parseAbi([
  "function getAllReservesTokens() view returns ((string symbol,address tokenAddress)[])",
  "function getReserveConfigurationData(address asset) view returns (uint256 decimals,uint256 ltv,uint256 liquidationThreshold,uint256 liquidationBonus,uint256 reserveFactor,bool usageAsCollateralEnabled,bool borrowingEnabled,bool stableBorrowRateEnabled,bool isActive,bool isFrozen)",
  "function getReserveTokensAddresses(address asset) view returns (address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress)",
  "function getReserveData(address asset) view returns (uint256 unbacked,uint256 accruedToTreasuryScaled,uint256 totalAToken,uint256 totalStableDebt,uint256 totalVariableDebt,uint256 liquidityRate,uint256 variableBorrowRate,uint256 stableBorrowRate,uint256 averageStableBorrowRate,uint256 liquidityIndex,uint256 variableBorrowIndex,uint40 lastUpdateTimestamp)",
  "function getReserveCaps(address asset) view returns (uint256 borrowCap,uint256 supplyCap)",
  "function getPaused(address asset) view returns (bool)",
  "function getDebtCeiling(address asset) view returns (uint256)",
]);

const zeroBalance = encodeFunctionResult({
  abi: erc20Abi,
  functionName: "balanceOf",
  result: 0n,
});
const wethBalance = encodeFunctionResult({
  abi: erc20Abi,
  functionName: "balanceOf",
  result: 2_000_000_000_000_000_000n,
});
const unpricedBalance = encodeFunctionResult({
  abi: erc20Abi,
  functionName: "balanceOf",
  result: 1_000_000_000_000_000_000n,
});
const balanceResponse = encodeFunctionResult({
  abi: multicall3Abi,
  functionName: "aggregate3",
  result: ethereumTokenRegistryV1.map((_, index) => ({
    success: true,
    returnData:
      index === wethIndex
        ? wethBalance
        : index === unpricedIndex
          ? unpricedBalance
          : zeroBalance,
  })),
});
const priceResponse = encodeFunctionResult({
  abi: multicall3Abi,
  functionName: "aggregate3",
  result: [
    {
      success: true,
      returnData: encodeFunctionResult({
        abi: oracleAbi,
        functionName: "BASE_CURRENCY_UNIT",
        result: 100_000_000n,
      }),
    },
    {
      success: true,
      returnData: encodeFunctionResult({
        abi: oracleAbi,
        functionName: "getAssetPrice",
        result: 300_000_000_000n,
      }),
    },
  ],
});
const ensNameResponse = encodeFunctionResult({
  abi: ensReverseAbi,
  functionName: "reverse",
  result: [
    "powerrr.eth",
    "0x0000000000000000000000000000000000000000",
    "0x0000000000000000000000000000000000000000",
  ],
});
const gweiNameResponse = encodeFunctionResult({
  abi: gnsReverseAbi,
  functionName: "reverseResolve",
  result: "powerrr.gwei",
});
const directRpcResponses = buildDirectRpcResponses();

function buildDirectRpcResponses(): Record<string, string> {
  const responses: Record<string, string> = {};
  const add = (
    functionName: string,
    args: readonly unknown[],
    result: unknown,
  ) => {
    const data = encodeFunctionData({
      abi: aaveDataAbi,
      functionName,
      args,
    } as never);
    responses[data.toLowerCase()] = encodeFunctionResult({
      abi: aaveDataAbi,
      functionName,
      result,
    } as never);
  };

  add(
    "getAllReservesTokens",
    [],
    [
      { symbol: "WETH", tokenAddress: weth },
      { symbol: "USDC", tokenAddress: usdc },
    ],
  );
  add("getReserveTokensAddresses", [usdc], [aUsdc, zero, zero]);
  add(
    "getReserveConfigurationData",
    [usdc],
    [6n, 0n, 0n, 0n, 1_000n, false, true, false, true, false],
  );
  add(
    "getReserveConfigurationData",
    [weth],
    [18n, 8_000n, 8_300n, 10_500n, 1_000n, true, true, false, true, false],
  );
  for (const asset of [usdc, weth]) {
    add(
      "getReserveData",
      [asset],
      [
        0n,
        0n,
        0n,
        0n,
        0n,
        0n,
        50_000_000_000_000_000_000_000_000n,
        0n,
        0n,
        0n,
        0n,
        0,
      ],
    );
    add("getReserveCaps", [asset], [0n, 0n]);
    add("getPaused", [asset], false);
    add("getDebtCeiling", [asset], 0n);
  }
  responses[
    encodeFunctionData({
      abi: oracleAbi,
      functionName: "BASE_CURRENCY_UNIT",
    }).toLowerCase()
  ] = encodeFunctionResult({
    abi: oracleAbi,
    functionName: "BASE_CURRENCY_UNIT",
    result: 100_000_000n,
  });
  for (const [asset, price] of [
    [usdc, 100_000_000n],
    [weth, 300_000_000_000n],
  ] as const) {
    responses[
      encodeFunctionData({
        abi: oracleAbi,
        functionName: "getAssetPrice",
        args: [asset],
      }).toLowerCase()
    ] = encodeFunctionResult({
      abi: oracleAbi,
      functionName: "getAssetPrice",
      result: price,
    });
  }
  responses[
    encodeFunctionData({
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [aUsdc],
    }).toLowerCase()
  ] = encodeFunctionResult({
    abi: erc20Abi,
    functionName: "balanceOf",
    result: 1_000_000_000_000n,
  });
  return responses;
}

async function installWallet(
  page: Page,
  options: { nameDelayMs?: number; namesAvailable?: boolean } = {},
): Promise<void> {
  const nameDelayMs = options.nameDelayMs ?? 0;
  const namesAvailable = options.namesAvailable ?? true;
  await page.addInitScript(
    ({
      account,
      balanceResponse,
      priceResponse,
      ensNameResponse,
      gweiNameResponse,
      ensResolver,
      gnsNameNft,
      nameDelayMs,
      namesAvailable,
      directRpcResponses,
    }) => {
      const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
      let multicallNumber = 0;
      const provider = {
        async request({
          method,
          params,
        }: {
          method: string;
          params?: unknown[];
        }) {
          const state = window as typeof window & {
            __rpcMethods?: string[];
            __ethCallCount?: number;
          };
          state.__rpcMethods ??= [];
          state.__rpcMethods.push(method);
          if (method === "eth_requestAccounts" || method === "eth_accounts") {
            return [account];
          }
          if (method === "eth_chainId") return "0x1";
          if (method === "eth_blockNumber") return "0x1234";
          if (method === "eth_getBlockByNumber") {
            return {
              timestamp: `0x${Math.floor(Date.now() / 1000).toString(16)}`,
            };
          }
          if (method === "eth_getCode") return "0x60016000";
          if (method === "eth_getBalance") return "0x0";
          if (method === "eth_call") {
            state.__ethCallCount = (state.__ethCallCount ?? 0) + 1;
            const to = (
              params?.[0] as { to?: string } | undefined
            )?.to?.toLowerCase();
            if (to === ensResolver.toLowerCase()) {
              if (nameDelayMs > 0) {
                await new Promise((resolve) =>
                  window.setTimeout(resolve, nameDelayMs),
                );
              }
              return namesAvailable ? ensNameResponse : "0x";
            }
            if (to === gnsNameNft.toLowerCase()) {
              if (nameDelayMs > 0) {
                await new Promise((resolve) =>
                  window.setTimeout(resolve, nameDelayMs),
                );
              }
              return namesAvailable ? gweiNameResponse : "0x";
            }
            const data = (
              params?.[0] as { data?: string } | undefined
            )?.data?.toLowerCase();
            if (data && directRpcResponses[data]) {
              return directRpcResponses[data];
            }
            multicallNumber += 1;
            if (multicallNumber === 1) return balanceResponse;
            if (multicallNumber === 2) return priceResponse;
            return "0x";
          }
          if (method === "wallet_switchEthereumChain") return null;
          throw new Error(`Unexpected RPC method ${method}`);
        },
        on(event: string, listener: (...args: unknown[]) => void) {
          const set = listeners.get(event) ?? new Set();
          set.add(listener);
          listeners.set(event, set);
        },
        removeListener(event: string, listener: (...args: unknown[]) => void) {
          listeners.get(event)?.delete(listener);
        },
      };
      const announce = () =>
        window.dispatchEvent(
          new CustomEvent("eip6963:announceProvider", {
            detail: Object.freeze({
              info: {
                uuid: "00000000-0000-4000-8000-000000000001",
                name: "Test Wallet",
                rdns: "test.wallet",
                icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
              },
              provider,
            }),
          }),
        );
      window.addEventListener("eip6963:requestProvider", announce);
      announce();
    },
    {
      account,
      balanceResponse,
      priceResponse,
      ensNameResponse,
      gweiNameResponse,
      ensResolver: ENS_UNIVERSAL_RESOLVER,
      gnsNameNft: GNS_NAME_NFT,
      nameDelayMs,
      namesAvailable,
      directRpcResponses,
    },
  );
}

async function connectAndScan(page: Page): Promise<void> {
  await installWallet(page);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Connect wallet" }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Connect wallet" }).first().click();
  await expect(
    page.getByRole("heading", {
      name: "Wallet snapshot for powerrr.eth · powerrr.gwei",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/verified primary names read onchain/i),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Disconnect/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Edit address/i })).toHaveCount(
    0,
  );
}

test("wallet read disclosure opens without shifting the landing layout", async ({
  page,
}) => {
  await installWallet(page);
  await page.goto("/");
  const hero = page.locator("#wallet-options");
  const before = await hero.boundingBox();
  await page.getByRole("button", { name: "How it works" }).click();
  await expect(page.locator("#wallet-read-info")).toBeVisible();
  const after = await hero.boundingBox();
  expect(after?.y).toBe(before?.y);
  expect(after?.height).toBe(before?.height);
});

test("wallet identity resolves before its final label is published", async ({
  page,
}) => {
  await installWallet(page, { nameDelayMs: 350 });
  await page.goto("/");
  await page.getByRole("button", { name: "Connect wallet" }).first().click();

  await expect(
    page.getByRole("button", { name: "Resolving wallet name" }),
  ).toBeVisible();
  await expect(page.getByText("0x0000…00A1", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: /Disconnect wallet powerrr\.eth · powerrr\.gwei/i,
    }),
  ).toBeVisible();
});

test("wallet identity falls back to the address after name lookup completes", async ({
  page,
}) => {
  await installWallet(page, { nameDelayMs: 200, namesAvailable: false });
  await page.goto("/");
  await page.getByRole("button", { name: "Connect wallet" }).first().click();

  await expect(
    page.getByRole("button", { name: "Resolving wallet name" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Disconnect wallet 0x0000…00A1/i }),
  ).toBeVisible();
});

test("the interface stays light regardless of system preference", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.getByTestId("theme-toggle")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).backgroundColor,
    ),
  ).toBe("rgb(243, 238, 229)");
  expect(await page.evaluate(() => localStorage.getItem("powerrr-theme"))).toBe(
    null,
  );
});

test("static wallet scan is explicit and uses no Powerrr API", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await connectAndScan(page);

  await expect(page.getByText("WETH", { exact: true })).toBeVisible();
  await expect(page.getByText(/\$6,000/).first()).toBeVisible();
  const unavailablePrices = page.getByText("Price unavailable (1)", {
    exact: true,
  });
  await expect(unavailablePrices).toBeVisible();
  await expect(unavailablePrices.locator("..")).not.toHaveAttribute("open");
  await page.getByText("About this estimate").click();
  await expect(
    page.getByText(
      `${ethereumTokenRegistryV1.length}/${ethereumTokenRegistryV1.length} succeeded`,
    ),
  ).toBeVisible();
  await expect(page.locator("time[datetime]")).toContainText("Loaded");
  await expect(page.getByText(/s old$/)).toHaveCount(0);
  await expect(
    page.getByText(/No account, balance, or request was posted/),
  ).toBeVisible();
  await expect(
    page.getByText("Registry and policy", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Multicall3", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Vendored Uniswap/)).toHaveCount(0);

  const rpcMethods = await page.evaluate(
    () =>
      (window as typeof window & { __rpcMethods?: string[] }).__rpcMethods ??
      [],
  );
  expect(rpcMethods).toContain("eth_requestAccounts");
  expect(rpcMethods).toContain("eth_call");
  expect(rpcMethods).not.toContain("personal_sign");
  expect(rpcMethods).not.toContain("eth_sendTransaction");
  expect(requests.some((url) => /\/api\/v[12]\//.test(url))).toBe(false);

  await page.getByRole("button", { name: "Compare 1 selected asset" }).click();
  await expect(
    page.getByRole("heading", { name: "Compare borrowing paths" }),
  ).toBeVisible();
  await expect(page.getByLabel("Borrow amount in USDC")).toHaveValue("1,844");
  await expect(page.locator('input[type="range"]')).toHaveCount(1);
  await page.getByLabel("Borrow amount in USDC").fill("1000");
  await expect(page.getByText(/pooled providers cover \$1,000/)).toBeVisible();
});

test("pooled risk responds to the selected amount without an always-green state", async ({
  page,
}) => {
  await connectAndScan(page);
  await page.getByRole("button", { name: "Compare 1 selected asset" }).click();
  await expect(
    page.getByText(/comparison range, not approved credit/i),
  ).toBeVisible();
  await expect(page.getByText("Amount shortcuts")).toHaveCount(0);
  await page.getByLabel("Borrow amount in USDC").fill("1000");
  const aave = page.locator('[data-protocol-id="aave"]');
  await expect(aave).toBeVisible();
  await aave.getByRole("button").first().click();
  await expect(
    aave.getByRole("heading", { name: "Why this limit" }),
  ).toBeVisible();
  await expect(
    aave.getByRole("heading", { name: "Your assets" }),
  ).toBeVisible();
  await expect(
    aave.getByText("Liquidation threshold", { exact: true }),
  ).toBeVisible();
  const amountSlider = page.getByLabel("Borrow amount comparison range");
  await expect(amountSlider).toBeVisible();
  await amountSlider.fill("0");
  await expect(
    aave.locator("a", { hasText: "Review on Aave" }),
  ).toHaveAttribute("aria-disabled", "true");
  await amountSlider.fill("1000");
  await expect(
    aave.getByRole("link", { name: "Review on Aave" }),
  ).toHaveAttribute("aria-disabled", "false");
});

test("OWN appears only above $1,000 and links to its public borrow form", async ({
  page,
}) => {
  await connectAndScan(page);
  await page.getByRole("button", { name: "Compare 1 selected asset" }).click();
  await page.getByLabel("Borrow amount in USDC").fill("1000");
  await expect(page.locator('[data-protocol-id="own"]')).toHaveCount(0);
  await page.getByLabel("Borrow amount in USDC").fill("1001");
  const ownOption = page.locator('[data-protocol-id="own"]');
  await expect(ownOption).toBeVisible();
  await ownOption.getByRole("button").click();
  await expect(
    ownOption.getByText("A direct route for non-standard collateral"),
  ).toBeVisible();
  await expect(ownOption.getByText("$1,001")).toBeVisible();
  await expect(page.getByText("Estimated total repayment")).toHaveCount(0);
  await expect(page.getByText("Illustrative terms")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Discuss this request with OWN" }),
  ).toHaveAttribute("href", "https://own.casa/borrow#contact");
});

test("the static result remains usable on a phone viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await connectAndScan(page);
  await expect(
    page.getByRole("heading", { name: "Choose collateral" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Compare 1 selected asset" }).click();
  await page.getByLabel("Borrow amount in USDC").fill("1000");
  await expect(page.locator('[data-protocol-id="own"]')).toHaveCount(0);
  const termsBounds = await page
    .locator('section[aria-labelledby="terms-title"]')
    .boundingBox();
  const amountBounds = await page
    .locator('label:has(input[aria-label="Borrow amount in USDC"])')
    .boundingBox();
  const rangeBounds = await page
    .getByLabel("Borrow amount comparison range")
    .boundingBox();
  expect(termsBounds).not.toBeNull();
  expect(amountBounds).not.toBeNull();
  expect(rangeBounds).not.toBeNull();
  expect(
    (amountBounds?.x ?? 0) + (amountBounds?.width ?? 0),
  ).toBeLessThanOrEqual((termsBounds?.x ?? 0) + (termsBounds?.width ?? 0));
  expect((rangeBounds?.x ?? 0) + (rangeBounds?.width ?? 0)).toBeLessThanOrEqual(
    (termsBounds?.x ?? 0) + (termsBounds?.width ?? 0),
  );
  const aave = page.locator('[data-protocol-id="aave"]');
  await aave.getByRole("button").first().click();
  await expect(
    aave.getByRole("link", { name: "Review on Aave" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("the connected result has no detectable WCAG A or AA violations", async ({
  page,
}) => {
  await connectAndScan(page);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("the light mobile risk review remains accessible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await connectAndScan(page);
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).backgroundColor,
    ),
  ).toBe("rgb(243, 238, 229)");

  await page.getByRole("button", { name: "Compare 1 selected asset" }).click();
  await page.getByLabel("Borrow amount in USDC").fill("1000");
  const aave = page.locator('[data-protocol-id="aave"]');
  await aave.getByRole("button").first().click();
  await expect(
    aave.getByRole("heading", { name: "Why this limit" }),
  ).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
