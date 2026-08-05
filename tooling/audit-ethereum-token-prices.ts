import { writeFile } from "node:fs/promises";
import {
  auditEthereumTokenPricesAtBlock,
  type Eip1193Request,
} from "../apps/website/utils/static-discovery.ts";
import type { Hex } from "viem";

const rpcUrl = process.env.PUBLIC_ETHEREUM_RPC_URL;
const outputPath = process.argv[2];
if (!rpcUrl || !outputPath) {
  throw new Error(
    "Usage: PUBLIC_ETHEREUM_RPC_URL=<url> pnpm exec tsx tooling/audit-ethereum-token-prices.ts <output.json>",
  );
}

let requestId = 0;
const provider = {
  async request<TResult>({ method, params }: Eip1193Request): Promise<TResult> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: ++requestId,
          method,
          params: params ?? [],
        }),
      });
      if (response.ok) {
        const payload = (await response.json()) as {
          result?: TResult;
          error?: { code: number; message: string };
        };
        if (payload.error) {
          throw new Error(
            `${method} failed (${payload.error.code}): ${payload.error.message}`,
          );
        }
        return payload.result as TResult;
      }
      if (response.status !== 429 && response.status < 500) {
        throw new Error(`${method} failed with HTTP ${response.status}`);
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(8_000, 500 * 2 ** attempt)),
      );
    }
    throw new Error(`${method} failed after retries`);
  },
};

const chainId = await provider.request<Hex>({ method: "eth_chainId" });
if (BigInt(chainId) !== 1n)
  throw new Error(`Expected chain 1, received ${chainId}`);
const blockTag = process.env.AUDIT_BLOCK_TAG
  ? (process.env.AUDIT_BLOCK_TAG as Hex)
  : await provider.request<Hex>({ method: "eth_blockNumber" });
const block = await provider.request<{ timestamp?: Hex; hash?: Hex }>({
  method: "eth_getBlockByNumber",
  params: [blockTag, false],
});
if (!block.timestamp || !block.hash) {
  throw new Error(`Block ${blockTag} did not include timestamp and hash`);
}

const audit = await auditEthereumTokenPricesAtBlock({
  provider,
  blockTag,
  blockTimestampSeconds: Number(BigInt(block.timestamp)),
});
const available = audit.results.filter((entry) => entry.price.priceUsd);
const unavailable = audit.results.filter((entry) => !entry.price.priceUsd);
const report = {
  generatedAt: new Date().toISOString(),
  rpcHost: new URL(rpcUrl).host,
  block: {
    tag: blockTag,
    number: BigInt(blockTag).toString(),
    hash: block.hash,
    timestamp: new Date(Number(BigInt(block.timestamp)) * 1_000).toISOString(),
  },
  registryCount: audit.results.length,
  availableCount: available.length,
  unavailableCount: unavailable.length,
  coverageRate: available.length / audit.results.length,
  chunkSizes: audit.chunkSizes,
  sourceCounts: Object.fromEntries(
    Object.entries(
      available.reduce<Record<string, number>>((counts, entry) => {
        const source = entry.price.source ?? "unknown";
        counts[source] = (counts[source] ?? 0) + 1;
        return counts;
      }, {}),
    ).sort(([left], [right]) => left.localeCompare(right)),
  ),
  unavailable: unavailable.map((entry) => ({
    address: entry.address,
    symbol: entry.symbol,
    name: entry.name,
    ...(entry.snapshotRank ? { snapshotRank: entry.snapshotRank } : {}),
    ...(entry.marketId ? { marketId: entry.marketId } : {}),
    reason: entry.price.reason,
  })),
  results: audit.results,
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify(
    {
      outputPath,
      block: report.block,
      registryCount: report.registryCount,
      availableCount: report.availableCount,
      unavailableCount: report.unavailableCount,
      sourceCounts: report.sourceCounts,
      unavailable: report.unavailable,
    },
    null,
    2,
  ),
);
