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

Open `http://127.0.0.1:3000` with an injected Ethereum wallet, connect, and run
the read-only scan. Select collateral, enter a borrowing amount, and compare
Aave, Spark, Compound, or Morpho before reviewing the separate OWN fixed-term
request option.

OWN defaults to **Request required** because verified liquidity defaults to
zero. Selecting **Review fixed-term option** shows illustrative terms and risk
mechanics. **Request with OWN** opens OWN's external borrower intake without
adding wallet or estimate data to the URL.

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
