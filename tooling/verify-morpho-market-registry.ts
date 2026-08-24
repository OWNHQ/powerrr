import {
  ETHEREUM_MORPHO_USDC_EXECUTABLE_COUNT,
  ETHEREUM_MORPHO_USDC_OFFICIAL_LISTED_COUNT,
  ethereumMorphoUsdcOfficialMarketIdsV1,
  ethereumMorphoUsdcMarketsV1,
} from "../packages/configs/src/ethereum-morpho-usdc-markets.ts";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
// Morpho API replicas briefly disagree on this expired 2 April 2026 PT market.
// It is not executable or part of the current checked-in official snapshot.
const STALE_OFFICIAL_LISTING_TOLERANCES = new Set([
  "0x27b9a0a5bfee98a31eb51e3850250d103a9f8e41673c782defc66aa943af0e65",
]);

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
const officialMarketIds = official
  .map((market) => market.marketId.toLowerCase())
  .sort();
const checkedInIds = ethereumMorphoUsdcOfficialMarketIdsV1
  .map((marketId) => marketId.toLowerCase())
  .sort();
if (checkedInIds.length !== ETHEREUM_MORPHO_USDC_OFFICIAL_LISTED_COUNT) {
  throw new Error("Morpho official-listed manifest count is inconsistent.");
}

const checkedIn = new Set(checkedInIds);
const officialSet = new Set(officialMarketIds);
const additions = officialMarketIds.filter((id) => !checkedIn.has(id));
const removals = checkedInIds.filter((id) => !officialSet.has(id));
const unexpectedAdditions = additions.filter(
  (id) => !STALE_OFFICIAL_LISTING_TOLERANCES.has(id),
);
if (unexpectedAdditions.length || removals.length) {
  throw new Error(
    `Morpho official-listed set changed. Additions: ${unexpectedAdditions.join(", ") || "none"}. Removals: ${removals.join(", ") || "none"}. Regenerate and review before release.`,
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
    ignoredStaleListings: additions.filter((id) =>
      STALE_OFFICIAL_LISTING_TOLERANCES.has(id),
    ),
  }),
);
