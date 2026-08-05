import { readFile } from "node:fs/promises";
import { getAddress } from "viem";

const path = new URL(
  "../packages/configs/src/ethereum-top250.ts",
  import.meta.url,
);
const source = await readFile(path, "utf8");
const configSource = await readFile(
  new URL("../packages/configs/src/index.ts", import.meta.url),
  "utf8",
);
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
const reviewedSection = configSource.match(
  /const reviewedTokens:[\s\S]*?= \[([\s\S]*?)\] as const;/,
)?.[1];
if (!reviewedSection)
  throw new Error("Could not parse reviewed registry tokens");
const reviewedTokens = [
  ...reviewedSection.matchAll(/\["(0x[0-9a-fA-F]{40})", "([^"]+)"/g),
].map(([, address, symbol]) => ({ address, symbol }));
const reviewedAdditions = ["LINK", "MKR"].map((symbol) => {
  const token = reviewedTokens.find((candidate) => candidate.symbol === symbol);
  if (!token) throw new Error(`Missing reviewed registry addition ${symbol}`);
  if (addresses.has(token.address.toLowerCase())) {
    throw new Error(`${symbol} unexpectedly appears in the ranked snapshot`);
  }
  return token;
});
if (reviewedAdditions.map((token) => token.symbol).join(",") !== "LINK,MKR") {
  throw new Error(
    `Expected reviewed additions LINK,MKR; received ${reviewedAdditions.map((token) => token.symbol).join(",")}`,
  );
}

const report = {
  registry: "ethereum-top250-2026-07-29-v1",
  snapshotDate: "2026-07-29",
  rankedTokens: tokens.length,
  reviewedAdditions,
  additionsCount: reviewedAdditions.length,
  runtimeContracts: addresses.size + reviewedAdditions.length,
  checksumValid: true,
  runtimePricingHierarchy: [
    "reviewed protocol oracle",
    "fresh Chainlink USD feed",
    "liquid Uniswap V3 30-minute TWAP",
    "high-liquidity Uniswap V3 spot (low confidence)",
  ],
  note: "Ranking membership verifies Ethereum metadata, not a Chainlink feed or liquid Uniswap pool. Live price availability is checked at the wallet's pinned block.",
  provenanceGap:
    "The original generator input JSON files were not retained, so LINK and MKR's precise ranking-join rejection cannot be reconstructed. Future generations must retain source hashes and rejected-token reasons.",
};

console.log(JSON.stringify(report, null, 2));
