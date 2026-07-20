# Tutorial: run both Powerrr workflows

This tutorial gets the public estimator and internal risk workbench running with deterministic examples. It takes about five minutes after dependencies are installed.

## 1. Install and verify

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` should finish with passing TypeScript checks and tests.

## 2. Run the public estimator

```bash
pnpm dev:website
```

Open `http://127.0.0.1:3000`. The diversified fixture wallet loads
automatically and is labelled **Demo data**. Review the usable asset strip,
select the featured OWN request opportunity, and move the amount slider. Then
select Aave, Spark, Compound, or Morpho to see the protocol-threshold risk view.

OWN defaults to **Request required** because verified liquidity defaults to
zero. Click **Request an OWN offer** to exercise the local development delivery
flow. Development accepts the form without sending PII anywhere; production
requires the configured signed webhook.

## 3. Run the borrower-risk workbench

In another terminal:

```bash
pnpm dev:internal-underwriter
```

Open `http://127.0.0.1:3001`. The verified base case runs automatically. Review the recommendation, supported principal, main risks, affordability, collateral recovery, and loss view. Click **Run all stresses** to compare adverse capacity.

Try **Stretched affordability** and **Unverified evidence**. The first should reduce capacity or produce a counteroffer; the second must require manual review.

## 4. Confirm the safety boundary

The workbench shows PD and expected loss as **Uncalibrated**. This is intentional: the project has no validated borrower-outcomes dataset. EAD and recovery-based LGD remain available because they are facility calculations rather than invented default probabilities.

Next, follow [Deploy live mode](../how-to/deploy-live.md) when you have a production Ethereum RPC endpoint.
