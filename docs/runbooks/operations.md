# Runbook: operations and incident response

## Normal checks

Monitor `/api/v1/healthz` every minute and alert on non-2xx status, a mode other than `live`, or loss of every exact protocol source. Track quote latency, source failures, rate-limit responses, and the age of quote provenance. Never put wallet addresses or borrower request bodies in metrics labels or logs.

After every deployment:

1. Verify version and schema.
2. Confirm the protocol list contains only live-ready adapters.
3. Run `tooling/live-smoke.mjs` against the exact deployment URL.
4. Confirm `runtimeTier`, `sourcePolicySatisfied`, `completeness`, block,
   observations, and cache age are truthful. A preview must report
   `productionSafe: false`.
5. Authenticate to the internal workbench and run the verified, stretched, unverified, and high-risk examples.
6. Confirm missing evidence cannot return `within-policy` and PD remains null.

Track quote p50/p95 latency, partial-result rate, stale/unknown observation
rate, per-provider failure rate, cache-hit rate, and rate limiting. Alert on
total quote failure or sustained provider degradation.

## Source outage

If one protocol source fails, healthy quote rows should remain and the affected
provider should carry a sanitized availability code and reason. A failure that
prevents address or portfolio discovery returns `PROTOCOL_SOURCE_UNAVAILABLE`.
It must never fall back to fixtures. Check provider status, DNS/TLS,
credentials, quota, timeout, circuit state, and primary/secondary RPC health.

## Suspect quote

Record the request ID, protocol, calculated time, served time, cache age, pinned
block, observation times, source, and application version without copying the
wallet or borrower data into chat or an incident ticket. Reproduce against the
same block where supported. Disable the affected adapter or entire site if a
source-semantic error can overstate capacity.

## Suspect borrower decision

Pause use of the policy version. Preserve the assessment ID, policy version, reason codes, evidence references, and human decision in the controlled system of record. Determine whether the problem is input verification, policy, formula, UI, or manual override. Do not edit historical outputs; publish a new policy version and document affected cases.

## Secret exposure

Rotate the RPC credential, internal API token/signing secret, or workbench password immediately. Invalidate proxy/session caches, inspect access logs under the privacy policy, and redeploy. Secrets must never appear in health output; diagnostics expose only configuration booleans and environment-key names.

## Rollback

Deploy the last known-good image digest and keep the database-free application stateless. A rollback must not reactivate a retired policy accidentally: verify `/api/v2/policies/current` after rollback and keep external policy/change records versioned.
