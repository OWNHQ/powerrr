import { readFile, writeFile } from "node:fs/promises";
import { ethereumTokenRegistryV1 } from "../packages/configs/src/index.ts";
import {
  createPublicClient,
  erc20Abi,
  formatUnits,
  getAddress,
  http,
  parseAbi,
  parseAbiItem,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { mainnet } from "viem/chains";

const rpcUrl = process.env.PUBLIC_ETHEREUM_RPC_URL;
const [priceAuditPath, outputPath] = process.argv.slice(2);
if (!rpcUrl || !priceAuditPath || !outputPath) {
  throw new Error(
    "Usage: PUBLIC_ETHEREUM_RPC_URL=<url> pnpm exec tsx tooling/audit-ethereum-token-status.ts <price-audit.json> <output.json>",
  );
}

const priceAudit = JSON.parse(await readFile(priceAuditPath, "utf8")) as {
  block: { tag: Hex; number: string; hash: Hex; timestamp: string };
  unavailable: Array<{ address: Address; symbol: string }>;
  results: Array<{
    address: Address;
    symbol: string;
    price: { priceUsd?: number };
  }>;
};
const blockNumber = BigInt(priceAudit.block.number);
const client = createPublicClient({
  chain: mainnet,
  transport: http(rpcUrl, { retryCount: 4, retryDelay: 750, timeout: 30_000 }),
  batch: { multicall: { batchSize: 16_384, wait: 25 } },
});
const unavailableAddresses = new Set(
  priceAudit.unavailable.map((entry) => entry.address.toLowerCase()),
);
const tokens = ethereumTokenRegistryV1.filter((token) =>
  unavailableAddresses.has(token.address.toLowerCase()),
);

const factories = [
  {
    name: "Uniswap V2",
    address: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f" as Address,
  },
  {
    name: "SushiSwap V2",
    address: "0xc0aee478e3658e2610c5f7a4a2e1777ce9e4f2ac" as Address,
  },
] as const;
const quoteSymbols = new Set(["WETH", "USDC", "USDT", "DAI"]);
const quotes = ethereumTokenRegistryV1.filter((token) =>
  quoteSymbols.has(token.symbol),
);
const quotePrices = new Map(
  priceAudit.results.flatMap((entry) =>
    entry.price.priceUsd
      ? [[entry.address.toLowerCase(), entry.price.priceUsd]]
      : [],
  ),
);
const pairFactoryAbi = parseAbi([
  "function getPair(address tokenA, address tokenB) view returns (address pair)",
]);

const contractState = await client.multicall({
  allowFailure: true,
  blockNumber,
  contracts: tokens.flatMap((token) => [
    {
      address: token.address as Address,
      abi: erc20Abi,
      functionName: "totalSupply" as const,
    },
    {
      address: token.address as Address,
      abi: erc20Abi,
      functionName: "decimals" as const,
    },
  ]),
});

const pairCandidates = tokens.flatMap((token) =>
  factories.flatMap((factory) =>
    quotes.map((quote) => ({ token, quote, factory })),
  ),
);
const pairResults: Array<
  | { status: "success"; result: Address }
  | { status: "failure"; error: Error; result?: undefined }
> = [];
const pairContracts = pairCandidates.map((candidate) => ({
  address: candidate.factory.address,
  abi: pairFactoryAbi,
  functionName: "getPair" as const,
  args: [
    candidate.token.address as Address,
    candidate.quote.address as Address,
  ] as const,
}));
for (let index = 0; index < pairContracts.length; index += 100) {
  pairResults.push(
    ...(await client.multicall({
      allowFailure: true,
      blockNumber,
      contracts: pairContracts.slice(index, index + 100),
    })),
  );
}
const existingPairs = pairCandidates.flatMap((candidate, index) => {
  const result = pairResults[index];
  return result?.status === "success" && result.result !== zeroAddress
    ? [{ ...candidate, pair: getAddress(result.result) }]
    : [];
});
const pairQueryFailures = pairResults.filter(
  (result) => result.status === "failure",
);
const pairBalances: Array<
  | { status: "success"; result: bigint }
  | { status: "failure"; error: Error; result?: undefined }
> = [];
const pairBalanceContracts = existingPairs.flatMap((candidate) => [
  {
    address: candidate.token.address as Address,
    abi: erc20Abi,
    functionName: "balanceOf" as const,
    args: [candidate.pair],
  },
  {
    address: candidate.quote.address as Address,
    abi: erc20Abi,
    functionName: "balanceOf" as const,
    args: [candidate.pair],
  },
]);
for (let index = 0; index < pairBalanceContracts.length; index += 100) {
  pairBalances.push(
    ...(await client.multicall({
      allowFailure: true,
      blockNumber,
      contracts: pairBalanceContracts.slice(index, index + 100),
    })),
  );
}

const codeByAddress = new Map<string, Hex | undefined>();
await mapWithConcurrency(tokens, 8, async (token) => {
  const code = await client.getCode({
    address: token.address as Address,
    blockNumber,
  });
  codeByAddress.set(token.address.toLowerCase(), code);
});

const transferActivity = new Map<
  string,
  {
    status: "found" | "none" | "unknown";
    fromBlock?: string;
    count?: number;
    error?: string;
  }
>();
const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);
const activityRanges = [
  { fromLookback: 100n, toLookback: 0n },
  { fromLookback: 1_000n, toLookback: 0n },
  { fromLookback: 10_000n, toLookback: 0n },
  ...Array.from({ length: 19 }, (_, index) => ({
    fromLookback: BigInt((index + 2) * 10_000),
    toLookback: BigInt((index + 1) * 10_000 + 1),
  })),
];
await mapWithConcurrency(tokens, 4, async (token) => {
  for (const range of activityRanges) {
    const fromBlock =
      blockNumber > range.fromLookback ? blockNumber - range.fromLookback : 0n;
    const toBlock = blockNumber - range.toLookback;
    try {
      const logs = await client.getLogs({
        address: token.address as Address,
        event: transferEvent,
        fromBlock,
        toBlock,
      });
      if (logs.length) {
        transferActivity.set(token.address.toLowerCase(), {
          status: "found",
          fromBlock: fromBlock.toString(),
          count: logs.length,
        });
        return;
      }
    } catch (cause) {
      transferActivity.set(token.address.toLowerCase(), {
        status: "unknown",
        fromBlock: fromBlock.toString(),
        error: cause instanceof Error ? cause.message : String(cause),
      });
      return;
    }
  }
  transferActivity.set(token.address.toLowerCase(), {
    status: "none",
    fromBlock: (blockNumber - 200_000n).toString(),
    count: 0,
  });
});

const results = tokens.map((token, tokenIndex) => {
  const totalSupplyResult = contractState[tokenIndex * 2];
  const decimalsResult = contractState[tokenIndex * 2 + 1];
  const pairs = existingPairs.flatMap((candidate, pairIndex) => {
    if (candidate.token.address.toLowerCase() !== token.address.toLowerCase()) {
      return [];
    }
    const tokenBalanceResult = pairBalances[pairIndex * 2];
    const quoteBalanceResult = pairBalances[pairIndex * 2 + 1];
    if (
      tokenBalanceResult?.status !== "success" ||
      quoteBalanceResult?.status !== "success"
    ) {
      return [];
    }
    const quoteBalance = Number(
      formatUnits(quoteBalanceResult.result, candidate.quote.decimals),
    );
    const quotePriceUsd = quotePrices.get(
      candidate.quote.address.toLowerCase(),
    );
    return [
      {
        factory: candidate.factory.name,
        pair: candidate.pair,
        quote: candidate.quote.symbol,
        tokenBalanceRaw: tokenBalanceResult.result.toString(),
        quoteBalanceRaw: quoteBalanceResult.result.toString(),
        quoteLiquidityUsd:
          quotePriceUsd && Number.isFinite(quoteBalance)
            ? quoteBalance * quotePriceUsd
            : undefined,
      },
    ];
  });
  const code = codeByAddress.get(token.address.toLowerCase());
  return {
    address: token.address,
    symbol: token.symbol,
    name: token.name,
    snapshotRank: token.snapshotRank,
    marketId: token.marketId,
    codeBytes: code && code !== "0x" ? (code.length - 2) / 2 : 0,
    totalSupplyRaw:
      totalSupplyResult?.status === "success"
        ? totalSupplyResult.result.toString()
        : undefined,
    configuredDecimals: token.decimals,
    runtimeDecimals:
      decimalsResult?.status === "success"
        ? Number(decimalsResult.result)
        : undefined,
    transferActivity: transferActivity.get(token.address.toLowerCase()),
    pairs: pairs.sort(
      (left, right) =>
        (right.quoteLiquidityUsd ?? 0) - (left.quoteLiquidityUsd ?? 0),
    ),
    maximumDirectV2QuoteLiquidityUsd: Math.max(
      0,
      ...pairs.map((pair) => pair.quoteLiquidityUsd ?? 0),
    ),
  };
});
const candidates = results.filter(
  (entry) =>
    entry.codeBytes === 0 ||
    (entry.totalSupplyRaw === "0" &&
      entry.transferActivity?.status === "none" &&
      entry.maximumDirectV2QuoteLiquidityUsd === 0),
);
const report = {
  generatedAt: new Date().toISOString(),
  rpcHost: new URL(rpcUrl).host,
  block: priceAudit.block,
  failedProductionAppraisals: tokens.length,
  contractCodePresent: results.filter((entry) => entry.codeBytes > 0).length,
  nonzeroSupply: results.filter(
    (entry) => entry.totalSupplyRaw && entry.totalSupplyRaw !== "0",
  ).length,
  recentTransferActivity: results.filter(
    (entry) => entry.transferActivity?.status === "found",
  ).length,
  directV2Liquidity: results.filter(
    (entry) => entry.maximumDirectV2QuoteLiquidityUsd > 0,
  ).length,
  pairQueries: pairResults.length,
  pairQueryFailures: pairQueryFailures.length,
  existingPairs: existingPairs.length,
  pairQueryErrorSamples: pairQueryFailures
    .slice(0, 3)
    .map((result) =>
      result.error instanceof Error
        ? result.error.message
        : String(result.error),
    ),
  automaticDeadCandidates: candidates,
  results,
};
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify(
    {
      outputPath,
      block: report.block,
      failedProductionAppraisals: report.failedProductionAppraisals,
      contractCodePresent: report.contractCodePresent,
      nonzeroSupply: report.nonzeroSupply,
      recentTransferActivity: report.recentTransferActivity,
      directV2Liquidity: report.directV2Liquidity,
      automaticDeadCandidates: report.automaticDeadCandidates,
      inactiveWithoutDirectV2Liquidity: results.filter(
        (entry) =>
          entry.transferActivity?.status === "none" &&
          entry.maximumDirectV2QuoteLiquidityUsd === 0,
      ),
    },
    null,
    2,
  ),
);

async function mapWithConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  run: (value: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (index < values.length) {
        const value = values[index];
        index += 1;
        if (value) await run(value);
      }
    }),
  );
}
