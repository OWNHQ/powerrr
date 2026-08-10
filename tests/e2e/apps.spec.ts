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
const multicall3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "value", type: "uint8" }],
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
const failedBalanceResponse = encodeFunctionResult({
  abi: multicall3Abi,
  functionName: "aggregate3",
  result: ethereumTokenRegistryV1.map((_, index) => ({
    success: index !== wethIndex,
    returnData:
      index === wethIndex
        ? "0x"
        : index === unpricedIndex
          ? unpricedBalance
          : zeroBalance,
  })),
});
const decimalsResponse = encodeFunctionResult({
  abi: multicall3Abi,
  functionName: "aggregate3",
  result: [wethIndex, unpricedIndex]
    .sort((left, right) => left - right)
    .map((index) => ({
      success: true,
      returnData: encodeFunctionResult({
        abi: erc20Abi,
        functionName: "decimals",
        result: ethereumTokenRegistryV1[index]!.decimals,
      }),
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
const balanceRequestData = encodeFunctionData({
  abi: multicall3Abi,
  functionName: "aggregate3",
  args: [
    ethereumTokenRegistryV1.map((token) => ({
      target: token.address,
      allowFailure: true,
      callData: encodeFunctionData({
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account],
      }),
    })),
  ],
}).toLowerCase();
const decimalsRequestData = encodeFunctionData({
  abi: multicall3Abi,
  functionName: "aggregate3",
  args: [
    [wethIndex, unpricedIndex]
      .sort((left, right) => left - right)
      .map((index) => ({
        target: ethereumTokenRegistryV1[index]!.address,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: erc20Abi,
          functionName: "decimals",
        }),
      })),
  ],
}).toLowerCase();
const failedDecimalsRequestData = encodeFunctionData({
  abi: multicall3Abi,
  functionName: "aggregate3",
  args: [
    [unpricedIndex].map((index) => ({
      target: ethereumTokenRegistryV1[index]!.address,
      allowFailure: true,
      callData: encodeFunctionData({
        abi: erc20Abi,
        functionName: "decimals",
      }),
    })),
  ],
}).toLowerCase();
const failedDecimalsResponse = encodeFunctionResult({
  abi: multicall3Abi,
  functionName: "aggregate3",
  result: [
    {
      success: true,
      returnData: encodeFunctionResult({
        abi: erc20Abi,
        functionName: "decimals",
        result: ethereumTokenRegistryV1[unpricedIndex]!.decimals,
      }),
    },
  ],
});
const failedMetadataResponse = encodeFunctionResult({
  abi: multicall3Abi,
  functionName: "aggregate3",
  result: [wethIndex, unpricedIndex]
    .sort((left, right) => left - right)
    .map((index) => ({
      success: index !== wethIndex,
      returnData:
        index === wethIndex
          ? "0x"
          : encodeFunctionResult({
              abi: erc20Abi,
              functionName: "decimals",
              result: ethereumTokenRegistryV1[index]!.decimals,
            }),
    })),
});
const wethPriceRoute = ethereumTokenRegistryV1[wethIndex]!.priceRoute;
if (wethPriceRoute.kind !== "aave-oracle") {
  throw new Error("The E2E WETH fixture requires its reviewed oracle route.");
}
const priceRequestData = encodeFunctionData({
  abi: multicall3Abi,
  functionName: "aggregate3",
  args: [
    [
      {
        target: wethPriceRoute.oracle,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: oracleAbi,
          functionName: "BASE_CURRENCY_UNIT",
        }),
      },
      {
        target: wethPriceRoute.oracle,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: oracleAbi,
          functionName: "getAssetPrice",
          args: [wethPriceRoute.asset],
        }),
      },
    ],
  ],
}).toLowerCase();
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
  options: {
    connectDelayMs?: number;
    nameDelayMs?: number;
    namesAvailable?: boolean;
    nativeBalanceHex?: string;
    hangMethod?: string;
    failWethBalance?: boolean;
    failWethMetadata?: boolean;
  } = {},
): Promise<void> {
  const connectDelayMs = options.connectDelayMs ?? 0;
  const nameDelayMs = options.nameDelayMs ?? 0;
  const namesAvailable = options.namesAvailable ?? true;
  const nativeBalanceHex = options.nativeBalanceHex ?? "0x0";
  const hangMethod = options.hangMethod ?? "";
  const failWethBalance = options.failWethBalance ?? false;
  const failWethMetadata = options.failWethMetadata ?? false;
  await page.addInitScript(
    ({
      account,
      balanceResponse,
      failedBalanceResponse,
      decimalsResponse,
      failedDecimalsResponse,
      failedMetadataResponse,
      priceResponse,
      ensNameResponse,
      gweiNameResponse,
      ensResolver,
      gnsNameNft,
      connectDelayMs,
      nameDelayMs,
      namesAvailable,
      nativeBalanceHex,
      hangMethod,
      failWethBalance,
      failWethMetadata,
      directRpcResponses,
      multicall3,
      balanceRequestData,
      decimalsRequestData,
      failedDecimalsRequestData,
      priceRequestData,
    }) => {
      const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
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
          if (method === hangMethod) {
            await new Promise<never>(() => undefined);
          }
          if (method === "eth_requestAccounts") {
            if (connectDelayMs > 0) {
              await new Promise((resolve) =>
                window.setTimeout(resolve, connectDelayMs),
              );
            }
            return [account];
          }
          if (method === "eth_accounts") {
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
          if (method === "eth_getBalance") return nativeBalanceHex;
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
            if (to === multicall3.toLowerCase()) {
              if (data === balanceRequestData) {
                return failWethBalance
                  ? failedBalanceResponse
                  : balanceResponse;
              }
              if (data === failedDecimalsRequestData) {
                return failedDecimalsResponse;
              }
              if (data === decimalsRequestData) {
                return failWethMetadata
                  ? failedMetadataResponse
                  : decimalsResponse;
              }
              if (data === priceRequestData) return priceResponse;
              return "0x";
            }
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
      (
        window as typeof window & {
          __emitWalletEvent?: (event: string, value?: unknown) => void;
        }
      ).__emitWalletEvent = (event, value) => {
        for (const listener of listeners.get(event) ?? []) listener(value);
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
      failedBalanceResponse,
      decimalsResponse,
      failedDecimalsResponse,
      failedMetadataResponse,
      priceResponse,
      ensNameResponse,
      gweiNameResponse,
      ensResolver: ENS_UNIVERSAL_RESOLVER,
      gnsNameNft: GNS_NAME_NFT,
      connectDelayMs,
      nameDelayMs,
      namesAvailable,
      nativeBalanceHex,
      hangMethod,
      failWethBalance,
      failWethMetadata,
      directRpcResponses,
      multicall3,
      balanceRequestData,
      decimalsRequestData,
      failedDecimalsRequestData,
      priceRequestData,
    },
  );
}

async function connectAndScan(page: Page): Promise<void> {
  await installWallet(page);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Connect wallet" }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await chooseTestWallet(page);
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

async function chooseTestWallet(page: Page): Promise<void> {
  const trigger = page.getByRole("button", { name: "Connect wallet" }).first();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Choose a wallet" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /Test Wallet/ }).click();
}

test("wallet choice is explicit, private, and keyboard accessible", async ({
  page,
}) => {
  await installWallet(page);
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Connect wallet" }).first();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Choose a wallet" });
  await expect(dialog).toBeVisible();
  expect(
    await page.evaluate(() =>
      (
        window as typeof window & { __rpcMethods?: string[] }
      ).__rpcMethods?.includes("eth_requestAccounts"),
    ),
  ).not.toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await dialog.getByRole("button", { name: /Test Wallet/ }).click();
  await expect(
    page.getByRole("heading", { name: /Wallet snapshot for/ }),
  ).toBeVisible();
  await expect(page.getByText("powerrr.eth", { exact: true })).toBeVisible();
  await expect(page.getByText("0x0000…00A1", { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("powerrr:last-wallet-rdns")),
  ).toBe("test.wallet");
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    account,
  );

  await page.getByRole("button", { name: /Disconnect wallet/ }).click();
  await expect(
    page.getByText("Wallet disconnected.", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("powerrr:last-wallet-rdns")),
  ).toBeNull();
});

test("wallet account, network, and disconnect events replace stale state", async ({
  page,
}) => {
  await connectAndScan(page);
  const changedAccount = "0x00000000000000000000000000000000000000B2";
  const blockReadsBefore = await page.evaluate(
    () =>
      (
        window as typeof window & { __rpcMethods?: string[] }
      ).__rpcMethods?.filter((method) => method === "eth_blockNumber").length ??
      0,
  );

  await page.evaluate((nextAccount) => {
    (
      window as typeof window & {
        __emitWalletEvent?: (event: string, value?: unknown) => void;
      }
    ).__emitWalletEvent?.("accountsChanged", [nextAccount]);
  }, changedAccount);
  await expect(page.getByText("0x0000…00B2", { exact: true })).toHaveCount(0);
  await expect(page.getByText("powerrr.eth", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Wallet snapshot for/ }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & { __rpcMethods?: string[] }
          ).__rpcMethods?.filter((method) => method === "eth_blockNumber")
            .length ?? 0,
      ),
    )
    .toBeGreaterThan(blockReadsBefore);

  await page.evaluate(() => {
    (
      window as typeof window & {
        __emitWalletEvent?: (event: string, value?: unknown) => void;
      }
    ).__emitWalletEvent?.("chainChanged", "0x89");
  });
  await expect(
    page.getByText(/Powerrr supports Ethereum Mainnet/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Wallet snapshot for/ }),
  ).toHaveCount(0);

  await page.evaluate(() => {
    (
      window as typeof window & {
        __emitWalletEvent?: (event: string, value?: unknown) => void;
      }
    ).__emitWalletEvent?.("chainChanged", "0x1");
  });
  await expect(
    page.getByRole("heading", { name: /Wallet snapshot for/ }),
  ).toBeVisible();

  await page.evaluate(() => {
    (
      window as typeof window & {
        __emitWalletEvent?: (event: string, value?: unknown) => void;
      }
    ).__emitWalletEvent?.("disconnect");
  });
  await expect(
    page.getByText("Wallet disconnected.", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("powerrr:last-wallet-rdns")),
  ).toBeNull();
});

test("wallet motion communicates active work and respects reduced motion", async ({
  page,
}) => {
  await installWallet(page, { connectDelayMs: 1_200, nameDelayMs: 3_000 });
  await page.goto("/");
  await chooseTestWallet(page);
  await expect(
    page.getByRole("heading", {
      name: /Connecting to Test Wallet|Checking your wallet/,
    }),
  ).toBeVisible();
  await expect(page.locator(".scan-dial-sweep")).toHaveCSS(
    "animation-name",
    "scan-dial-turn",
  );
  const ownCredit = page.getByRole("link", { name: "OWN", exact: true });
  await ownCredit.evaluate((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      (
        window as typeof window & { __ownCreditClickedDuringScan?: boolean }
      ).__ownCreditClickedDuringScan = true;
    });
  });
  await ownCredit.click();
  expect(
    await page.evaluate(
      () =>
        (
          window as typeof window & {
            __ownCreditClickedDuringScan?: boolean;
          }
        ).__ownCreditClickedDuringScan,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("heading", { name: /Wallet snapshot for/ }),
  ).toBeVisible();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Checking your wallet" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (
        window as typeof window & { __rpcMethods?: string[] }
      ).__rpcMethods?.includes("eth_accounts"),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() =>
      (
        window as typeof window & { __rpcMethods?: string[] }
      ).__rpcMethods?.includes("eth_requestAccounts"),
    ),
  ).toBe(false);
  const reducedDurationMs = await page
    .locator(".scan-dial-sweep")
    .evaluate(
      (element) =>
        Number.parseFloat(getComputedStyle(element).animationDuration) * 1_000,
    );
  expect(reducedDurationMs).toBeLessThanOrEqual(0.01);
});

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

test("a wallet scan can be cancelled after account permission", async ({
  page,
}) => {
  await installWallet(page, { hangMethod: "eth_blockNumber" });
  await page.goto("/");
  await chooseTestWallet(page);
  await expect(
    page.getByRole("heading", { name: "Checking your wallet" }),
  ).toBeVisible();
  const cancel = page.getByRole("button", { name: "Cancel" });
  await expect(cancel).toBeVisible();
  await cancel.click();
  await expect(
    page.getByRole("button", { name: "Connect wallet" }).first(),
  ).toBeVisible();
  await expect(page.getByText("Connection cancelled.")).toBeVisible();
});

test("failed balance reads remain visible and prevent a definitive empty state", async ({
  page,
}) => {
  await installWallet(page, { failWethBalance: true });
  await page.goto("/");
  await chooseTestWallet(page);
  await expect(
    page.getByRole("heading", {
      name: "Wallet snapshot for powerrr.eth · powerrr.gwei",
    }),
  ).toBeVisible();
  await expect(page.getByText("Balance unknown (1)")).toBeVisible();
  await expect(
    page.getByText(/A positive balance cannot be ruled out/),
  ).toBeVisible();
  await expect(page.getByText("No tracked assets found")).toHaveCount(0);
  await page.getByText("About this estimate").click();
  await expect(
    page.getByText(
      `${ethereumTokenRegistryV1.length - 1}/${ethereumTokenRegistryV1.length} succeeded`,
    ),
  ).toBeVisible();
});

test("failed metadata reads remain visible with an unknown token scale", async ({
  page,
}) => {
  await installWallet(page, { failWethMetadata: true });
  await page.goto("/");
  await chooseTestWallet(page);
  await expect(
    page.getByRole("heading", {
      name: "Wallet snapshot for powerrr.eth · powerrr.gwei",
    }),
  ).toBeVisible();
  await expect(page.getByText("Token scale unknown (1)")).toBeVisible();
  await expect(
    page.getByText(/Balance and value remain unknown/),
  ).toBeVisible();
  await expect(page.getByText("No tracked assets found")).toHaveCount(0);
});

test("wallet identity resolves before its final label is published", async ({
  page,
}) => {
  await installWallet(page, { nameDelayMs: 1_500 });
  await page.goto("/");
  await chooseTestWallet(page);

  await expect(
    page.getByRole("button", { name: "Resolving wallet name" }),
  ).toBeVisible();
  await expect(page.getByText("0x0000...00A1", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: /Disconnect wallet powerrr\.eth · powerrr\.gwei/i,
    }),
  ).toBeVisible();

  const estimateDetails = page.locator("[data-estimate-details]");
  await estimateDetails.getByText("About this estimate").click();
  await expect(
    estimateDetails.getByText("Test Wallet · powerrr.eth", { exact: true }),
  ).toBeVisible();
  await expect(estimateDetails.getByText(/0x0000\.\.\.00A1/)).toHaveCount(0);
});

test("wallet identity falls back to the address after name lookup completes", async ({
  page,
}) => {
  await installWallet(page, { nameDelayMs: 1_500, namesAvailable: false });
  await page.goto("/");
  await chooseTestWallet(page);

  await expect(
    page.getByRole("button", { name: "Resolving wallet name" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Disconnect wallet 0x0000\.\.\.00A1/i }),
  ).toBeVisible();

  const estimateDetails = page.locator("[data-estimate-details]");
  await estimateDetails.getByText("About this estimate").click();
  await expect(
    estimateDetails.getByText("Test Wallet · 0x0000...00A1", { exact: true }),
  ).toBeVisible();
});

test("the interface stays light regardless of system preference", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.getByTestId("theme-toggle")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  await expect(
    page.getByText("No browser wallet found", { exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole("button", { name: "Connect wallet" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(
    page.getByRole("dialog", { name: "Choose a wallet" }),
  ).toContainText("No browser wallet detected");
  await expect(
    page.getByRole("link", { name: "What is a wallet?" }),
  ).toHaveAttribute("href", "https://ethereum.org/wallets/");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Choose a wallet" }),
  ).not.toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(() => document.fonts.check('16px "Inter Variable"')),
  ).toBe(true);
  expect(
    await page.evaluate(() => getComputedStyle(document.body).fontFamily),
  ).toContain("Inter Variable");
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
  const priceSourceButton = page.getByRole("button", {
    name: "Show price source for WETH",
  });
  const priceSourcePanelId =
    await priceSourceButton.getAttribute("aria-controls");
  const priceSourceTriggerId = await priceSourceButton.getAttribute("id");
  expect(priceSourcePanelId).not.toBeNull();
  expect(priceSourceTriggerId).not.toBeNull();
  const priceSourcePanel = page.locator(`#${priceSourcePanelId}`);
  const priceSourceTrigger = page.locator(`#${priceSourceTriggerId}`);
  await expect(priceSourceButton).toHaveAttribute("aria-expanded", "false");
  await expect(priceSourcePanel).not.toBeVisible();
  await priceSourceButton.hover();
  await expect(priceSourcePanel).not.toBeVisible();
  await priceSourceButton.focus();
  await expect(priceSourcePanel).not.toBeVisible();
  await priceSourceButton.click();
  const closePriceSourceButton = page.getByRole("button", {
    name: "Close price source for WETH",
  });
  await expect(priceSourceTrigger).toHaveAttribute("aria-expanded", "true");
  await expect(priceSourceTrigger).not.toBeVisible();
  await expect(closePriceSourceButton).toBeFocused();
  await expect(priceSourcePanel).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(priceSourcePanel).toBeVisible();
  await expect(priceSourcePanel.locator("p")).toHaveCSS("user-select", "text");
  await expect(
    priceSourcePanel.getByText("Oracle:", { exact: true }),
  ).toBeVisible();
  await expect(
    priceSourcePanel.getByText("0x54586bE62E3c3580375aE3723C145253060Ca0C2", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "View oracle contract for WETH on Etherscan",
    }),
  ).toHaveAttribute(
    "href",
    "https://etherscan.io/address/0x54586bE62E3c3580375aE3723C145253060Ca0C2",
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (
            window as typeof window & { __copiedPriceSource?: string }
          ).__copiedPriceSource = value;
        },
      },
    });
  });
  await page
    .getByRole("button", { name: "Copy oracle address for WETH" })
    .click();
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __copiedPriceSource?: string })
          .__copiedPriceSource,
    ),
  ).toBe("0x54586bE62E3c3580375aE3723C145253060Ca0C2");
  await expect(
    page.getByRole("button", { name: "Price source copied" }),
  ).toBeVisible();
  await closePriceSourceButton.click();
  await expect(priceSourcePanel).not.toBeVisible();
  await expect(priceSourceButton).toBeFocused();
  await priceSourceButton.click();
  await page.keyboard.press("Escape");
  await expect(priceSourcePanel).not.toBeVisible();
  await expect(priceSourceButton).toBeFocused();
  const wethTile = page.locator('[data-collateral-asset="WETH"]');
  const wethTileBounds = await wethTile.boundingBox();
  expect(wethTileBounds).not.toBeNull();
  expect(wethTileBounds?.height ?? 0).toBeLessThanOrEqual(88);
  await priceSourceButton.click();
  await page.locator("[data-asset-workspace-main] > div").first().click();
  await expect(priceSourceButton).toHaveAttribute("aria-expanded", "false");
  await expect(priceSourcePanel).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Compare 1 selected asset" }),
  ).toBeVisible();
  const unavailablePrices = page.getByText("Price unavailable (1)", {
    exact: true,
  });
  await expect(unavailablePrices).toBeVisible();
  await expect(unavailablePrices.locator("..")).not.toHaveAttribute("open");
  await unavailablePrices.click();
  const unpricedAsset = ethereumTokenRegistryV1[unpricedIndex]!;
  const unavailableAssetButton = page.getByRole("button", {
    name: `${unpricedAsset.symbol} cannot be selected because its price is unavailable`,
  });
  await expect(unavailableAssetButton).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Compare 1 selected asset" }),
  ).toBeVisible();
  const estimateDetails = page.locator("[data-estimate-details]");
  await expect(page.locator("#workflow").locator("..")).toHaveCSS(
    "transform",
    "none",
  );
  const estimateTopBeforeOpen = await estimateDetails.evaluate(
    (element) => element.getBoundingClientRect().top + window.scrollY,
  );
  await page.getByText("About this estimate").click();
  await expect(page.getByText("Asset registry", { exact: true })).toHaveCount(
    0,
  );
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
  const estimateTopAfterOpen = await estimateDetails.evaluate(
    (element) => element.getBoundingClientRect().top + window.scrollY,
  );
  expect(
    Math.abs(estimateTopAfterOpen - estimateTopBeforeOpen),
  ).toBeLessThanOrEqual(1);
  const assetWorkspace = page.locator("[data-asset-workspace-main]");
  const selectionSummary = page.locator("[data-selection-summary]");
  const assetWorkspaceBounds = await assetWorkspace.boundingBox();
  const selectionSummaryBounds = await selectionSummary.boundingBox();
  const estimateDetailsBounds = await estimateDetails.boundingBox();
  expect(assetWorkspaceBounds).not.toBeNull();
  expect(selectionSummaryBounds).not.toBeNull();
  expect(estimateDetailsBounds).not.toBeNull();
  expect(selectionSummaryBounds?.x ?? 0).toBeGreaterThan(
    (assetWorkspaceBounds?.x ?? 0) + (assetWorkspaceBounds?.width ?? 0),
  );
  await expect(selectionSummary).toHaveCSS("position", "sticky");
  expect(
    (estimateDetailsBounds?.y ?? 0) -
      ((assetWorkspaceBounds?.y ?? 0) + (assetWorkspaceBounds?.height ?? 0)),
  ).toBeLessThanOrEqual(24);
  await expect(
    selectionSummary.getByRole("button", {
      name: "Compare 1 selected asset",
    }),
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
  expect(
    rpcMethods.filter((method) => method === "eth_blockNumber"),
  ).toHaveLength(1);
  expect(rpcMethods).not.toContain("personal_sign");
  expect(rpcMethods).not.toContain("eth_sendTransaction");
  expect(requests.some((url) => /\/api\/v[12]\//.test(url))).toBe(false);

  const callsAfterSnapshot = await page.evaluate(
    () =>
      (window as typeof window & { __ethCallCount?: number }).__ethCallCount ??
      0,
  );

  await page.getByRole("button", { name: "Compare 1 selected asset" }).click();
  await expect(
    page.getByRole("heading", { name: "Compare borrowing paths" }),
  ).toBeVisible();
  const comparisonControl = page.locator("[data-comparison-control]");
  const providerField = page.locator("[data-provider-field]");
  const comparisonControlBounds = await comparisonControl.boundingBox();
  const providerFieldBounds = await providerField.boundingBox();
  expect(comparisonControlBounds).not.toBeNull();
  expect(providerFieldBounds).not.toBeNull();
  expect(comparisonControlBounds?.x ?? Infinity).toBeLessThan(
    providerFieldBounds?.x ?? 0,
  );
  await expect(comparisonControl).toHaveCSS("position", "sticky");
  const collateralCoverage = page.locator("[data-collateral-coverage]");
  await expect(collateralCoverage).toBeVisible();
  await expect(
    collateralCoverage.locator("[data-coverage-selected]"),
  ).toHaveText("$6,000");
  await expect(
    collateralCoverage.locator("[data-coverage-modeled]"),
  ).toHaveText("$6,000");
  await expect(collateralCoverage.locator("[data-coverage-gap]")).toHaveText(
    "$0",
  );
  await expect(
    collateralCoverage.getByText(
      "All selected collateral is included by at least one currently available pooled estimate.",
    ),
  ).toHaveCount(0);
  await expect(
    collateralCoverage.getByText(
      "Some provider sources were unavailable, so pooled coverage may be understated.",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Borrow amount in USDC")).toHaveValue("2400.00");
  await expect(page.getByText("$4,800 ceiling", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Ceiling and capacity utilization use the highest pooled estimate ($4,800).",
      { exact: true },
    ),
  ).toHaveCount(0);
  const fiftyPercentUtilization = page.getByRole("button", {
    name: /50% capacity utilization/,
  });
  await expect(fiftyPercentUtilization).toHaveAccessibleName(
    "50% capacity utilization",
  );
  await expect(page.getByText("Morpho reference", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText("current", { exact: true })).toHaveCount(0);
  await expect(fiftyPercentUtilization).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /25% capacity utilization/ }).click();
  await expect(page.getByLabel("Borrow amount in USDC")).toHaveValue("1200.00");
  await fiftyPercentUtilization.click();
  await expect(page.getByLabel("Borrow amount in USDC")).toHaveValue("2400.00");
  await expect(page.locator('input[type="range"]')).toHaveCount(1);
  await expect(
    page.getByText("5.00% variable APR", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Projected LTV", { exact: true })).toHaveCount(3);
  for (const protocolId of ["aave", "sparklend"]) {
    const card = page.locator(`[data-protocol-id="${protocolId}"]`);
    await expect(
      card.getByText("Projected LTV", { exact: true }),
    ).toBeVisible();
    await expect(card.getByText("40.0%", { exact: true })).toBeVisible();
  }
  const borrowAmount = page.getByLabel("Borrow amount in USDC");
  await borrowAmount.fill("6649.28129");
  await page
    .getByRole("heading", { name: "Borrowing paths", exact: true })
    .click();
  await expect(borrowAmount).toHaveValue("6649.28");
  await page.getByLabel("Borrow amount in USDC").fill("1e21");
  await expect(page.getByText(/plain non-negative USDC amount/i)).toBeVisible();
  await page.getByLabel("Borrow amount in USDC").fill("0.0000001");
  await expect(page.getByText(/at most 6 decimal places/i)).toBeVisible();
  await page.getByLabel("Borrow amount in USDC").fill("1000");
  await expect(
    page.getByText(/eligible providers? covers? \$1,000/),
  ).toBeVisible();
  const callsAfterInteractions = await page.evaluate(
    () =>
      (window as typeof window & { __ethCallCount?: number }).__ethCallCount ??
      0,
  );
  expect(callsAfterInteractions).toBe(callsAfterSnapshot);
  const refreshButton = page.getByRole("button", { name: "Refresh" });
  await refreshButton.click();
  await expect(
    page.getByRole("heading", { name: "Compare borrowing paths" }),
  ).toBeVisible();
  await expect(refreshButton).toBeEnabled();
  await expect(page.getByLabel("Borrow amount in USDC")).toHaveValue("1000.00");
  const callsAfterRefresh = await page.evaluate(
    () =>
      (window as typeof window & { __ethCallCount?: number }).__ethCallCount ??
      0,
  );
  expect(callsAfterRefresh).toBeGreaterThan(callsAfterInteractions);
  await expect(page.getByText(/recommend/i)).toHaveCount(0);
  await expect(
    page.locator('[data-protocol-id="aave"] [data-health-factor]'),
  ).toHaveAttribute("data-risk-band", "wide");
  await expect(
    page.locator('[data-protocol-id="aave"] [data-health-factor]'),
  ).toHaveClass(/text-moss/);
});

test("pooled risk responds to the selected amount without an always-green state", async ({
  page,
}) => {
  await connectAndScan(page);
  await page.getByRole("button", { name: "Compare 1 selected asset" }).click();
  await expect(page.getByText("Amount shortcuts")).toHaveCount(0);
  await page.getByLabel("Borrow amount in USDC").fill("1000");
  const aave = page.locator('[data-protocol-id="aave"]');
  const aaveAction = aave.locator("[data-provider-action] a");
  await expect(aave).toBeVisible();
  await expect(aaveAction).toBeVisible();
  await expect(aaveAction).toHaveAttribute("aria-disabled", "false");
  const compoundAction = page
    .locator('[data-protocol-id="compound-iii"]')
    .locator("[data-provider-action] a");
  await expect(compoundAction).toBeVisible();
  await expect(compoundAction).toHaveAttribute("aria-disabled", "true");
  await aave.getByRole("button").first().click();
  await expect(
    aave.getByRole("heading", { name: "How this path is calculated" }),
  ).toBeVisible();
  await expect(
    aave.getByRole("heading", { name: "Contributing assets" }),
  ).toBeVisible();
  const providerAssetRows = aave.locator("ul li");
  await expect(providerAssetRows.first()).toContainText("WETH");
  await expect(providerAssetRows.first()).toContainText("$6,000");
  await expect(
    aave.getByText("Liquidation threshold", { exact: true }),
  ).toBeVisible();
  const actionBounds = await aaveAction.boundingBox();
  const assetsBounds = await aave
    .getByRole("heading", { name: "Contributing assets" })
    .boundingBox();
  expect(actionBounds).not.toBeNull();
  expect(assetsBounds).not.toBeNull();
  expect(actionBounds?.y ?? Infinity).toBeLessThan(assetsBounds?.y ?? 0);
  const amountSlider = page.getByLabel("Borrow amount comparison range");
  await expect(amountSlider).toBeVisible();
  await amountSlider.fill("0");
  await expect(
    aave.locator("a", { hasText: "Review Aave Ethereum Core V3" }),
  ).toHaveAttribute("aria-disabled", "true");
  await amountSlider.fill("1000");
  const aaveMarketLink = aave.getByRole("link", {
    name: "Review Aave Ethereum Core V3",
  });
  await expect(aaveMarketLink).toHaveAttribute("aria-disabled", "false");
  await expect(aaveMarketLink).toHaveAttribute(
    "href",
    "https://app.aave.com/?marketName=proto_mainnet_v3",
  );
});

test("native ETH and WETH both contribute to a WETH collateral path", async ({
  page,
}) => {
  await installWallet(page, {
    nativeBalanceHex: "0xde0b6b3a7640000",
  });
  await page.goto("/");
  await chooseTestWallet(page);
  await expect(
    page.getByRole("heading", { name: /Wallet snapshot for/ }),
  ).toBeVisible();
  await expect(
    page.getByText("Conversion required", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Compare 2 selected assets" }).click();

  const collateralCoverage = page.locator("[data-collateral-coverage]");
  await expect(
    collateralCoverage.locator("[data-coverage-selected]"),
  ).toHaveText("$9,000");
  await expect(
    collateralCoverage.locator("[data-coverage-modeled]"),
  ).toHaveText("$9,000");
  await expect(collateralCoverage.locator("[data-coverage-gap]")).toHaveText(
    "$0",
  );

  const aave = page.locator('[data-protocol-id="aave"]');
  await aave.getByRole("button").first().click();
  const contributionRows = aave.locator("ul li");
  await expect(contributionRows).toHaveCount(2);
  await expect(contributionRows.nth(0)).toContainText("WETH");
  await expect(contributionRows.nth(0)).toContainText("$6,000");
  await expect(contributionRows.nth(1)).toContainText("ETH");
  await expect(contributionRows.nth(1)).toContainText("$3,000");
  await expect(contributionRows.nth(1)).toContainText("Wrap required");

  await expect(page.getByLabel("Borrow amount in USDC")).toHaveValue("3600.00");
  const callsAfterSnapshot = await page.evaluate(
    () =>
      (window as typeof window & { __ethCallCount?: number }).__ethCallCount ??
      0,
  );

  await page.getByRole("button", { name: "Back to assets" }).click();
  await page
    .getByRole("button", { name: "Remove ETH from collateral selection" })
    .click({ position: { x: 16, y: 16 } });
  await page.getByRole("button", { name: "Compare 1 selected asset" }).click();
  await expect(page.getByLabel("Borrow amount in USDC")).toHaveValue("2400.00");

  await page.getByRole("button", { name: "Back to assets" }).click();
  await page
    .getByRole("button", { name: "Add ETH to collateral selection" })
    .click({ position: { x: 16, y: 16 } });
  await page.getByRole("button", { name: "Compare 2 selected assets" }).click();
  await expect(page.getByLabel("Borrow amount in USDC")).toHaveValue("3600.00");

  await page.getByLabel("Borrow amount in USDC").fill("7000");
  await page.getByRole("button", { name: "Back to assets" }).click();
  await page
    .getByRole("button", { name: "Remove ETH from collateral selection" })
    .click({ position: { x: 16, y: 16 } });
  await page.getByRole("button", { name: "Compare 1 selected asset" }).click();
  await expect(page.getByLabel("Borrow amount in USDC")).toHaveValue("7000.00");
  await expect(
    page.getByText(/0\/\d+ eligible providers? covers? \$7,000/),
  ).toBeVisible();
  await expect(
    page.locator('[data-protocol-id="aave"] [data-health-factor]'),
  ).toContainText("—");
  await expect(
    page.locator('[data-protocol-id="aave"] [data-health-factor]'),
  ).toContainText("Amount exceeds protocol maximum");

  const callsAfterInteractions = await page.evaluate(
    () =>
      (window as typeof window & { __ethCallCount?: number }).__ethCallCount ??
      0,
  );
  expect(callsAfterInteractions).toBe(callsAfterSnapshot);
});

test("refresh preserves collateral edits made while reads are in flight", async ({
  page,
}) => {
  await installWallet(page, {
    nativeBalanceHex: "0xde0b6b3a7640000",
    nameDelayMs: 1_000,
  });
  await page.goto("/");
  await chooseTestWallet(page);
  await page.getByRole("button", { name: "Compare 2 selected assets" }).click();
  const refresh = page.getByRole("button", { name: "Refresh" });
  await refresh.click();
  await page.getByRole("button", { name: "Back to assets" }).click();
  await page
    .getByRole("button", { name: "Remove ETH from collateral selection" })
    .click({ position: { x: 16, y: 16 } });
  await expect(
    page.getByRole("button", { name: "Compare 1 selected asset" }),
  ).toBeVisible();
  await expect(refresh).toBeEnabled({ timeout: 15_000 });
  await expect(
    page.getByRole("button", { name: "Add ETH to collateral selection" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Compare 1 selected asset" }),
  ).toBeVisible();
});

test("provider detail disclosure uses bounded motion and respects reduced motion", async ({
  page,
}) => {
  await connectAndScan(page);
  await page.getByRole("button", { name: "Compare 1 selected asset" }).click();
  await page.getByLabel("Borrow amount in USDC").fill("1000");

  const aave = page.locator('[data-protocol-id="aave"]');
  const toggle = aave.getByRole("button").first();
  await toggle.click();
  const disclosure = aave.locator("[data-provider-disclosure]");
  await expect(disclosure).toBeVisible();
  const standardDurations = await disclosure.evaluate((element) =>
    getComputedStyle(element)
      .transitionDuration.split(",")
      .map((value) => Number.parseFloat(value) * 1_000),
  );
  expect(Math.max(...standardDurations)).toBeGreaterThanOrEqual(180);
  expect(Math.max(...standardDurations)).toBeLessThanOrEqual(240);

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedDurations = await disclosure.evaluate((element) =>
    getComputedStyle(element)
      .transitionDuration.split(",")
      .map((value) => Number.parseFloat(value) * 1_000),
  );
  expect(Math.max(...reducedDurations)).toBeLessThanOrEqual(0.01);
  await toggle.click();
  await expect(disclosure).toHaveCount(0);
});

test("page-end credit links to OWN without listing it as a borrowing provider", async ({
  page,
}) => {
  await installWallet(page);
  await page.goto("/");
  const ownCredit = page.getByRole("link", { name: "OWN", exact: true });
  await expect(page.getByText("built by", { exact: true })).toBeVisible();
  await expect(ownCredit).toBeVisible();
  await expect(ownCredit).toHaveAttribute("href", "https://own.casa");
  await expect(ownCredit).toHaveAttribute("rel", "noopener noreferrer");

  await chooseTestWallet(page);
  await expect(
    page.getByRole("heading", { name: /Wallet snapshot for/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Compare 1 selected asset" }).click();
  await expect(page.locator('[data-protocol-id="own"]')).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Discuss this request with OWN" }),
  ).toHaveCount(0);
});

test("the static result remains usable on a phone viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await connectAndScan(page);
  await expect(
    page.getByRole("heading", { name: "Choose collateral" }),
  ).toBeVisible();
  const mobileAssetWorkspaceBounds = await page
    .locator("[data-asset-workspace-main]")
    .boundingBox();
  const mobileSelectionSummary = page.locator("[data-selection-summary]");
  const mobileEstimateDetails = page.locator("[data-estimate-details]");
  const mobileSelectionSummaryBounds =
    await mobileSelectionSummary.boundingBox();
  const mobileEstimateDetailsBounds = await mobileEstimateDetails.boundingBox();
  await expect(page.locator("#workflow").locator("..")).toHaveCSS(
    "transform",
    "none",
  );
  const mobileEstimateTopBeforeOpen = await mobileEstimateDetails.evaluate(
    (element) => element.getBoundingClientRect().top + window.scrollY,
  );
  await mobileEstimateDetails.locator("summary").click();
  const mobileEstimateTopAfterOpen = await mobileEstimateDetails.evaluate(
    (element) => element.getBoundingClientRect().top + window.scrollY,
  );
  expect(
    Math.abs(mobileEstimateTopAfterOpen - mobileEstimateTopBeforeOpen),
  ).toBeLessThanOrEqual(1);
  await mobileEstimateDetails.locator("summary").click();
  expect(mobileAssetWorkspaceBounds).not.toBeNull();
  expect(mobileSelectionSummaryBounds).not.toBeNull();
  expect(mobileEstimateDetailsBounds).not.toBeNull();
  expect(mobileSelectionSummaryBounds?.y ?? 0).toBeGreaterThan(
    (mobileAssetWorkspaceBounds?.y ?? 0) +
      (mobileAssetWorkspaceBounds?.height ?? 0),
  );
  await expect(mobileSelectionSummary).toHaveCSS("position", "static");
  expect(mobileEstimateDetailsBounds?.y ?? 0).toBeGreaterThan(
    (mobileSelectionSummaryBounds?.y ?? 0) +
      (mobileSelectionSummaryBounds?.height ?? 0),
  );
  expect(
    (mobileEstimateDetailsBounds?.y ?? 0) -
      ((mobileSelectionSummaryBounds?.y ?? 0) +
        (mobileSelectionSummaryBounds?.height ?? 0)),
  ).toBeLessThanOrEqual(24);
  await page.getByRole("button", { name: "Compare 1 selected asset" }).click();
  await page.getByLabel("Borrow amount in USDC").fill("1000");
  const mobileComparisonControl = page.locator("[data-comparison-control]");
  const mobileProviderField = page.locator("[data-provider-field]");
  const mobileComparisonControlBounds =
    await mobileComparisonControl.boundingBox();
  const mobileProviderFieldBounds = await mobileProviderField.boundingBox();
  expect(mobileComparisonControlBounds).not.toBeNull();
  expect(mobileProviderFieldBounds).not.toBeNull();
  expect(mobileProviderFieldBounds?.y ?? 0).toBeGreaterThan(
    (mobileComparisonControlBounds?.y ?? 0) +
      (mobileComparisonControlBounds?.height ?? 0),
  );
  await expect(mobileComparisonControl).toHaveCSS("position", "static");
  await expect(page.locator('[data-protocol-id="own"]')).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "OWN", exact: true }),
  ).toBeVisible();
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
    aave.getByRole("link", { name: "Review Aave Ethereum Core V3" }),
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
    aave.getByRole("heading", { name: "How this path is calculated" }),
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
