# How to deploy live mode

The supported deployment path is the website server, which embeds the engine
SDK. The separate engine container is a fixture/reference service.

## Required configuration

The shared Vercel prototype intentionally uses no-key public infrastructure:

```dotenv
NUXT_ETHEREUM_RPC_URL=https://ethereum-rpc.publicnode.com
NUXT_MORPHO_GRAPHQL_URL=https://api.morpho.org/graphql
NUXT_POWERRR_DATA_MODE=live
NUXT_PUBLIC_POWERRR_DATA_MODE=live
NUXT_OWN_LEAD_DEVELOPMENT_MOCK=false
```

These values are committed in `vercel.json`. PublicNode has no availability
guarantee and is suitable only for this prototype. The health response identifies
the runtime as `public-rpc-preview` with `availabilityGuarantee: "none"`.

Copy `.env.example` to your secret manager or deployment environment. At minimum set:

```dotenv
POWERRR_DATA_MODE=live
POWERRR_RUNTIME_TIER=production
ETHEREUM_RPC_URL=https://your-authenticated-mainnet-rpc
POWERRR_RPC_AUTHENTICATED=true
ALCHEMY_API_KEY=secondary-provider-key
MORPHO_GRAPHQL_URL=https://api.morpho.org/graphql
POWERRR_SOURCE_CLIENT_TIMEOUT_MS=5000
POWERRR_REDIS_REST_URL=https://your-redis-rest-endpoint
POWERRR_REDIS_REST_TOKEN=replace-with-a-secret
UNDERWRITER_USERNAME=replace-me
UNDERWRITER_PASSWORD=use-a-long-random-secret
OWN_AVAILABLE_LIQUIDITY_USD=0
OWN_INDICATIVE_APR=0.095
OWN_TERM_MONTHS=24
OWN_LEAD_WEBHOOK_URL=https://your-system.example/own-leads
OWN_LEAD_WEBHOOK_SECRET=replace-with-a-long-random-secret
```

Set `POWERRR_INTERNAL_SIGNING_SECRET` if another service calls the protected v2 assessment endpoints. Keep every value except `NUXT_PUBLIC_*` server-side.

`compose.yaml` maps these operator-facing names to Nuxt's required `NUXT_*`
runtime keys. If you run the built `.output/server/index.mjs` files directly,
use `NUXT_POWERRR_DATA_MODE`, `NUXT_PUBLIC_POWERRR_DATA_MODE`,
`NUXT_ETHEREUM_RPC_URL`, `NUXT_MORPHO_GRAPHQL_URL`,
`NUXT_UNDERWRITER_USERNAME`, and `NUXT_UNDERWRITER_PASSWORD` instead. This
distinction matters after build time; plain variables do not override Nuxt
runtime configuration in a prebuilt server.

The OWN runtime equivalents are `NUXT_OWN_AVAILABLE_LIQUIDITY_USD`,
`NUXT_OWN_INDICATIVE_APR`, `NUXT_OWN_TERM_MONTHS`,
`NUXT_OWN_LEAD_WEBHOOK_URL`, and `NUXT_OWN_LEAD_WEBHOOK_SECRET`. If the
webhook URL or secret is missing, the production form is deliberately disabled.

## Build and start

```bash
podman compose build website underwriter
podman compose up -d website underwriter
```

Docker Compose is also compatible with `compose.yaml`.

Check readiness:

```bash
curl --fail http://127.0.0.1:3000/api/v1/healthz
curl --fail http://127.0.0.1:3000/api/v1/version
```

Then submit a small real-address quote explicitly restricted to one adapter:

```bash
curl --fail --request POST http://127.0.0.1:3000/api/v2/quotes \
  --header 'content-type: application/json' \
  --data '{"chainId":1,"input":{"address":"0x0000000000000000000000000000000000000000"},"mode":"wallet-estimate","targetBorrowAssets":["USDC"],"includeProtocols":["compound-iii"],"safetyProfile":"balanced"}'
```

Confirm `dataMode` is `live`, `runtimeTier` has the intended value,
`sourcePolicySatisfied` is true, `completeness` is understood, and every quote
has approved provenance. A preview must have `productionSafe: false`. A
production tier is blocked until health reports authenticated primary RPC,
secondary RPC, and distributed controls as configured.

Also confirm the quote contains the complete `portfolio`, a
`protocolAvailability` row for each requested provider, and the
`public-rpc-preview` warning. One failed provider should be `unavailable`
without removing healthy quote rows.

## Vercel preview and promotion

Keep the last fixture deployment URL before changing aliases; it is the rollback
target and is never used as an automatic fallback.

```bash
vercel deploy
SMOKE_BASE_URL=https://returned-preview.vercel.app node tooling/live-smoke.mjs
# Reassign the stable preview alias only after the smoke test passes.
vercel alias set https://returned-preview.vercel.app powerrr-ten.vercel.app
```

This alias update is not a production promotion. Do not run `vercel promote`
until it is explicitly authorized. After aliasing, verify health and a fresh
ENS quote again. Roll back by reassigning the preview alias to the recorded
known-good deployment, never by adding fixture fallback logic.

## Migration from PublicNode

Before production use, configure an authenticated Ethereum RPC with contractual
availability, rate limits sized for JSON-RPC batches, observability, and a tested
secondary provider. Set the explicit authentication attestation only after that
is true. Keep the registry and pinned-block behavior, run the same smoke tests,
and confirm no fixture provenance appears.

## Production controls

- Terminate TLS at a trusted reverse proxy and restrict the internal workbench by network policy in addition to HTTP Basic authentication.
- Use the authenticated primary RPC plus the configured Alchemy secondary; the
  shared client fails over only for retryable primary failures.
- Configure Redis REST state so serverless cache and rate limits are shared.
- Put Morpho behind a caching/retry proxy if availability is critical; its official API has no SLA.
- Ship logs and health alerts, but do not log request bodies, wallet addresses, or borrower inputs.
- Pin container digests, scan images, rotate secrets, back up policy/audit records, and rehearse rollback.
- Do not expose fixture mode on a production hostname.
