import {
  ETHEREUM_MORPHO_USDC_EXECUTABLE_COUNT,
  ETHEREUM_MORPHO_USDC_OFFICIAL_LISTED_COUNT,
  ethereumMorphoUsdcOfficialMarketIdsV1,
  ethereumMorphoUsdcMarketsV1,
} from "../packages/configs/src/ethereum-morpho-usdc-markets.ts";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const response = await fetch("https://blue-api.morpho.org/graphql", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    query: `query OfficialEthereumUsdcMarkets {
      markets(first: 1000, where: {
        chainId_in: [1]
        listed: true
        loanAssetAddress_in: ["0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"]
      }) {
        items { marketId collateralAsset { address } }
      }
    }`,
  }),
});
if (!response.ok) {
  throw new Error(
    `Official Morpho market enumeration failed (${response.status}).`,
  );
}
const payload = (await response.json()) as {
  data?: {
    markets?: {
      items?: Array<{
        marketId: string;
        collateralAsset: { address: string } | null;
      }>;
    };
  };
  errors?: Array<{ message: string }>;
};
const official = payload.data?.markets?.items;
if (!official || payload.errors?.length) {
  throw new Error(
    `Official Morpho market enumeration failed: ${payload.errors?.[0]?.message ?? "missing result"}`,
  );
}
if (official.length !== ETHEREUM_MORPHO_USDC_OFFICIAL_LISTED_COUNT) {
  throw new Error(
    `Morpho official-listed count changed from ${ETHEREUM_MORPHO_USDC_OFFICIAL_LISTED_COUNT} to ${official.length}. Regenerate and review before release.`,
  );
}

const officialMarketIds = official
  .map((market) => market.marketId.toLowerCase())
  .sort();
const checkedInIds = ethereumMorphoUsdcOfficialMarketIdsV1
  .map((marketId) => marketId.toLowerCase())
  .sort();
if (JSON.stringify(officialMarketIds) !== JSON.stringify(checkedInIds)) {
  const checkedIn = new Set(checkedInIds);
  const officialSet = new Set(officialMarketIds);
  const additions = officialMarketIds.filter((id) => !checkedIn.has(id));
  const removals = checkedInIds.filter((id) => !officialSet.has(id));
  throw new Error(
    `Morpho official-listed set changed. Additions: ${additions.join(", ") || "none"}. Removals: ${removals.join(", ") || "none"}. Regenerate and review before release.`,
  );
}

if (
  ethereumMorphoUsdcMarketsV1.length !== ETHEREUM_MORPHO_USDC_EXECUTABLE_COUNT
) {
  throw new Error(
    "Morpho executable market count does not match its manifest.",
  );
}
for (const market of ethereumMorphoUsdcMarketsV1) {
  if (
    market.collateralToken.toLowerCase() === ZERO_ADDRESS ||
    market.oracle.toLowerCase() === ZERO_ADDRESS ||
    market.irm.toLowerCase() === ZERO_ADDRESS ||
    !Number.isInteger(market.collateralDecimals) ||
    market.collateralDecimals <= 0 ||
    market.collateralDecimals > 36 ||
    BigInt(market.lltv) <= 0n ||
    BigInt(market.lltv) > 10n ** 18n
  ) {
    throw new Error(
      `Morpho executable market ${market.marketId} has invalid parameters.`,
    );
  }
}

console.log(
  JSON.stringify({
    status: "current",
    officialListed: official.length,
    executable: ethereumMorphoUsdcMarketsV1.length,
  }),
);
