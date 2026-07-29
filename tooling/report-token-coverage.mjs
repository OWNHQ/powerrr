import { readFile } from "node:fs/promises";
import { getAddress } from "viem";

const path = new URL(
  "../packages/configs/src/ethereum-top250.ts",
  import.meta.url,
);
const source = await readFile(path, "utf8");
const tokens = [
  ...source.matchAll(
    /address: "([^"]+)",[\s\S]*?symbol: "([^"]+)",[\s\S]*?decimals: (\d+),[\s\S]*?snapshotRank: (\d+),/g,
  ),
].map(([, address, symbol, decimals, snapshotRank]) => ({
  address,
  symbol,
  decimals: Number(decimals),
  snapshotRank: Number(snapshotRank),
}));
if (tokens.length !== 250) {
  throw new Error(
    `Expected 250 parsed snapshot entries, received ${tokens.length}`,
  );
}
const addresses = new Set();
for (const token of tokens) {
  if (getAddress(token.address) !== token.address) {
    throw new Error(`Non-checksummed registry address: ${token.address}`);
  }
  const normalized = token.address.toLowerCase();
  if (addresses.has(normalized))
    throw new Error(`Duplicate registry address: ${token.address}`);
  addresses.add(normalized);
  if (
    !Number.isInteger(token.decimals) ||
    token.decimals < 0 ||
    token.decimals > 255
  ) {
    throw new Error(`Invalid decimals for ${token.symbol}`);
  }
}

const report = {
  registry: "ethereum-top250-2026-07-29-v1",
  snapshotDate: "2026-07-29",
  rankedTokens: tokens.length,
  uniqueContracts: addresses.size,
  checksumValid: true,
  runtimePricingHierarchy: [
    "reviewed protocol oracle",
    "fresh Chainlink USD feed",
    "liquid Uniswap V3 30-minute TWAP",
    "high-liquidity Uniswap V3 spot (low confidence)",
  ],
  note: "Live price availability is checked at the wallet's pinned block and is never fabricated by this report.",
};

console.log(JSON.stringify(report, null, 2));
