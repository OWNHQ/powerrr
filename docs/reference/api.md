# API reference

Nuxt routes use the `/api` prefix. The standalone engine uses the same path after removing `/api`.

## Public endpoints

| Method | Path                         | Purpose                                                  |
| ------ | ---------------------------- | -------------------------------------------------------- |
| GET    | `/api/v1/livez`              | Process liveness without upstream reads                  |
| GET    | `/api/v1/healthz`            | Runtime mode, readiness, and redacted client diagnostics |
| GET    | `/api/v1/version`            | Engine and schema version                                |
| POST   | `/api/v1/resolve`            | Resolve a mainnet address or ENS name                    |
| GET    | `/api/v2/protocols`          | Protocol metadata available in the active mode           |
| POST   | `/api/v1/portfolio`          | Discover supported wallet assets and eligibility         |
| POST   | `/api/v2/quotes`             | Portfolio discovery and normalized borrowing quotes      |
| GET    | `/api/v1/own/leads/status`   | Whether OWN request delivery is configured               |
| POST   | `/api/v1/own/leads`          | Validate and deliver a consented OWN offer request       |
| GET    | `/api/v2/policies/current`   | Current borrower-risk policy                             |
| GET    | `/api/v2/policies/{version}` | A specific supported policy version                      |

Quote request:

```json
{
  "chainId": 1,
  "input": { "address": "0x1111111111111111111111111111111111111111" },
  "mode": "wallet-estimate",
  "targetBorrowAssets": ["USDC"],
  "collateralTokens": ["0x0000000000000000000000000000000000000000"],
  "includeProtocols": ["aave-v3", "compound-iii"],
  "safetyProfile": "balanced"
}
```

`collateralTokens` is optional. When present, it must contain one or more unique
token addresses discovered for the public address. Quotes and opportunities are
then calculated from that explicit collateral selection only. Omit the field to
discover the complete supported portfolio.

The response includes `dataMode`, `runtimeTier`, `calculatedAt`, `servedAt`,
`cache`, `completeness`, `sourcePolicySatisfied`, source `observations`, the
complete `portfolio`, `portfolioSummary`, `protocolAvailability`, and quote rows
with confidence, assumptions, warnings, and provenance. `generatedAt` and
`productionSafe` remain deprecated for one compatibility cycle. In the
`public-rpc-preview` tier, `productionSafe` is always false.

`calculatedAt` is when Powerrr calculated the result. `servedAt` is when that
particular response was delivered. Neither is an upstream observation time.
Use each observation's `observedAt`, block timestamp, measured age, and freshness
status. A cache hit retains the original calculation and observations and
reports its real `cache.ageSeconds`.

Send `Cache-Control: no-cache` to refresh the estimate from its upstream sources
instead of reading a previously calculated response from the application cache.

`protocolAvailability` contains one sanitized status per requested live provider:

```json
[
  { "protocolId": "aave-v3", "status": "available" },
  {
    "protocolId": "morpho-blue",
    "status": "unavailable",
    "code": "SOURCE_READ_FAILED",
    "reason": "Live estimate temporarily unavailable"
  }
]
```

Each quote uses `annualRate` to preserve the source convention:

```json
{
  "annualRate": {
    "value": 0.052,
    "convention": "apy",
    "rateType": "variable",
    "sourceId": "morpho-blue:market-id"
  }
}
```

`indicativeApr` is deprecated. Morpho rates remain APY; Aave, Spark, and
Compound rates remain APR-style annualized rates.

`quotes` contains provider-confirmed point-in-time estimates only. The optional
`opportunities` collection contains the non-executable OWN request opportunity.
OWN has separate configuration availability and freshness semantics and must
never be treated as an on-chain quote:

```json
{
  "opportunities": [
    {
      "id": "own",
      "rail": "own",
      "kind": "indicative-request",
      "potentialBorrowUsd": 101117.57,
      "availableNowUsd": 0,
      "fundingStatus": "request-required",
      "indicativeApr": 0.065,
      "termMonths": 24,
      "policyVersion": "own-collateral-v1-2026-07-15",
      "riskModel": "maturity-default"
    }
  ]
}
```

OWN lead requests require an email, wallet or ENS, requested amount, USDC,
term, collateral summary, policy version, UUID idempotency key, and
`consent: true`. A hidden `website` field is the honeypot. Production returns
503 when the webhook URL or signing secret is absent.

## Protected borrower-risk endpoints

| Method | Path                           | Purpose                                         |
| ------ | ------------------------------ | ----------------------------------------------- |
| POST   | `/api/v2/internal/assessments` | Assess one borrower/facility/collateral request |
| POST   | `/api/v2/internal/scenarios`   | Apply selected or all borrower stresses         |

Service requests may use `x-powerrr-internal-token` when a non-empty production token is configured. HMAC is preferred. Sign this newline-separated payload with SHA-256 HMAC:

```text
METHOD
/api/v2/internal/assessments
UNIX_TIMESTAMP_MILLISECONDS
SHA256(CANONICAL_JSON_BODY)
```

Send the timestamp in `x-powerrr-internal-timestamp` and lowercase hex signature in `x-powerrr-internal-signature`. Timestamps older than five minutes are rejected. Canonical JSON sorts object keys recursively and preserves array order.

## Error envelope

```json
{
  "error": {
    "code": "PROTOCOL_SOURCE_UNAVAILABLE",
    "message": "Live protocol read failed",
    "details": {}
  }
}
```

Live provider timeouts and individual source failures normally do not use the
error envelope: healthy providers are returned and failed providers are marked
in `protocolAvailability`. The envelope remains for invalid requests and failures
that prevent address/portfolio discovery.

Stable codes include `INVALID_INPUT`, `UNSUPPORTED_CHAIN`, `ENS_RESOLUTION_FAILED`, `PORTFOLIO_UNAVAILABLE`, `PROTOCOL_SOURCE_UNAVAILABLE`, `STALE_QUOTE_ONLY`, `SIMULATION_FAILED`, `RATE_LIMITED`, `UNAUTHORIZED`, and `INTERNAL_ERROR`.

The active borrower assessment schema is `2026-07-15`. The active policy endpoint is authoritative for policy thresholds; do not copy them from UI text.
