# How to operate the OWN request funnel

The featured OWN card is a qualified-request funnel, not a liquidity or approval claim. Its job is to show an honest collateral-based opportunity even when committed funding is zero, explain the fixed-term risk model, and capture enough information for the OWN team to follow up.

## Configure the opportunity

Set these server-side values:

```dotenv
OWN_AVAILABLE_LIQUIDITY_USD=0
OWN_INDICATIVE_APR=0.095
OWN_TERM_MONTHS=24
```

Keep available liquidity at zero unless a verified funding source supports a higher value. The amount is capped by the versioned OWN collateral policy before liquidity is applied. APR and term are indicative configuration, not borrower-specific pricing.

## Connect lead delivery

Set:

```dotenv
OWN_LEAD_WEBHOOK_URL=https://your-system.example/own-leads
OWN_LEAD_WEBHOOK_SECRET=replace-with-a-long-random-secret
OWN_LEAD_WEBHOOK_TIMEOUT_MS=5000
```

Production submission is disabled unless both URL and secret are present. Development can use `OWN_LEAD_DEVELOPMENT_MOCK=true`; never enable that setting in production.

Each webhook request contains `x-powerrr-idempotency-key` and `x-powerrr-signature`. Verify the signature by computing an HMAC-SHA256 over the exact raw request body with `OWN_LEAD_WEBHOOK_SECRET` and comparing it to the lowercase hex value after `sha256=`. Store the idempotency key and ignore duplicates.

The endpoint uses a short timeout, a honeypot, request validation, explicit consent, and an IP-scoped limit of 10 accepted attempts per minute. Application code must not log request bodies, email addresses, wallet addresses, or collateral details.

## Triage requests

1. Confirm consent and deduplicate by idempotency key.
2. Re-run the wallet through the current policy and record the policy version.
3. Verify ownership, sanctions/compliance status, collateral availability, and any lender constraints outside Powerrr.
4. Separate **potential capacity** from **verified funding available now** in every follow-up.
5. State that terms remain indicative until lender matching and final documentation.
6. Never translate the public collateral estimate into a borrower default probability.

Useful funnel measures are page-to-request conversion, qualified-request rate, response time, lender-match rate, funded amount, and reasons a request could not proceed. Aggregate those measures outside request logs and avoid putting direct identifiers into analytics events.
