const baseUrl = (process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const walletInput = process.env.SMOKE_WALLET_INPUT ?? "vitalik.eth";

const response = await fetch(`${baseUrl}/api/v2/quotes`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    accept: "application/json",
  },
  body: JSON.stringify({
    chainId: 1,
    input: { ensName: walletInput },
    mode: "wallet-estimate",
    targetBorrowAssets: ["USDC"],
    safetyProfile: "balanced",
  }),
});

if (!response.ok) {
  throw new Error(
    `Quote smoke request failed: HTTP ${response.status} ${await response.text()}`,
  );
}

const quoteResponse = await response.json();
assert(typeof quoteResponse.requestId === "string", "request ID is missing");
assert(
  /^\d+$/.test(quoteResponse.blockNumber),
  "quote is not pinned to a numeric Ethereum block",
);
assert(
  Number.isFinite(Date.parse(quoteResponse.calculatedAt)),
  "calculatedAt is invalid",
);
assert(
  Number.isFinite(Date.parse(quoteResponse.servedAt)),
  "servedAt is invalid",
);
assert(
  ["public-rpc-preview", "production"].includes(quoteResponse.runtimeTier),
  "live smoke unexpectedly used fixtures",
);
if (quoteResponse.runtimeTier !== "production") {
  assert(
    quoteResponse.productionSafe === false,
    "preview response claimed production safety",
  );
}
assert(
  ["complete", "partial"].includes(quoteResponse.completeness),
  "completeness is missing",
);
assert(
  ["hit", "miss"].includes(quoteResponse.cache?.status),
  "cache status is missing",
);
assert(
  Number.isFinite(quoteResponse.cache?.ageSeconds),
  "cache age is missing",
);

for (const asset of quoteResponse.portfolio?.assets ?? []) {
  assert(asset.symbol !== "UNKNOWN", "UNKNOWN token symbol escaped");
  assert(asset.amount > 0, `zero-value ${asset.symbol} row escaped`);
  if (asset.priceStatus === "unavailable") {
    assert(
      asset.marketValueUsd === null || asset.marketValueUsd === undefined,
      `${asset.symbol} has value despite unavailable price`,
    );
    assert(
      Object.values(asset.protocolEligible ?? {}).every(
        (eligible) => eligible === false,
      ),
      `${asset.symbol} contributes to a provider despite unavailable price`,
    );
  }
}

for (const quote of quoteResponse.quotes ?? []) {
  if (quote.annualRate) {
    assert(
      ["apr", "apy"].includes(quote.annualRate.convention),
      `${quote.protocolId} has an invalid annual-rate convention`,
    );
    assert(
      typeof quote.annualRate.sourceId === "string" &&
        quote.annualRate.sourceId.length > 0,
      `${quote.protocolId} rate has no source ID`,
    );
  }

  if (quote.protocolId === "morpho-blue" && quote.annualRate) {
    const marketId = quote.collateralUsed?.[0]?.marketId;
    assert(marketId, "Morpho quote has no selected market");
    assert(
      quote.annualRate.sourceId.endsWith(`:${marketId}`),
      "Morpho rate and selected market are not atomic",
    );
  }
}

assert(
  !JSON.stringify(quoteResponse).toLowerCase().includes("pwn"),
  "retired public branding escaped into the response",
);

console.log(
  JSON.stringify({
    ok: true,
    baseUrl,
    requestId: quoteResponse.requestId,
    runtimeTier: quoteResponse.runtimeTier,
    blockNumber: quoteResponse.blockNumber,
    completeness: quoteResponse.completeness,
    cache: quoteResponse.cache,
    providers: (quoteResponse.protocolAvailability ?? []).map((provider) => ({
      id: provider.protocolId,
      status: provider.status,
      code: provider.code,
    })),
  }),
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
