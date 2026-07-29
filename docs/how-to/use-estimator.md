# How to use the borrowing estimator

Use the estimator to see what a wallet may support, compare the risk mechanics of each venue, and move to the right next step. It does not approve a loan or submit a transaction.

## 1. Load a wallet

Connect a browser wallet. Powerrr only reads the selected account; it never
requests a signature or transaction.

Powerrr also checks for verified ENS and .gwei primary names with direct
contract calls through the wallet at the same pinned block. These labels are
optional. If a name is missing, invalid, or requires an offchain ENS gateway,
the estimator keeps showing the abbreviated address. No hosted name API or
HTTP/CCIP gateway is used.

The first panel lists the supported assets found in the wallet, their discovery values, and how many displayed providers can use each asset. Assets outside the Ethereum allowlist are not included in this release.

Always check the header badge:

- **Live data** means executable protocol rows were built from approved live sources.
- **Demo data** means deterministic examples. Do not use them for a real decision.

## 2. Set an amount

**Estimated provider limit** is the highest readable, buffered capacity from
the pooled providers. OWN numeric capacity is not published while its
production policy is under review. Amount shortcuts use the largest displayed
provider estimate; availability still depends on the path selected next.

## 3. Compare providers and OWN

Aave, Spark, Compound, and Morpho appear first and are ordered by estimated
safer capacity. Their amounts are live protocol quote rows when the source is
current and available.

OWN remains visible beneath the providers as a separate fixed-term route, but
it is not selectable and exposes no “up to” value or repayment total. It is
labelled **Request assessment** until its policy is approved.

## 4. Read the selected risk view

Move the slider or choose a preset.

For Aave, Spark, Compound, and Morpho, Powerrr shows:

- collateral and starting debt included in the scenario;
- projected total debt and projected LTV after the reviewed borrow;
- the rate with its APR or APY convention;
- value-weighted protocol borrow and liquidation limits; and
- a projected health factor where `1.00` is the protocol threshold;
- dollar headroom to the threshold; and
- utilization of Powerrr's recommended provider limit.

The operational label changes with the amount: wide at or above `1.60`,
reduced from `1.20` through `1.59`, thin above `1.00` and below `1.20`, at the
boundary at `1.00`, and above threshold below `1.00`. These labels describe
proximity, not liquidation probability or personal safety.

The estimated limit used by the amount control includes Powerrr's balanced
safety buffer and the provider's available liquidity. It is intentionally not
the same number as the raw, value-weighted protocol borrow limit shown in the
risk details.

These are threshold calculations, not a probability forecast. Powerrr deliberately does not claim that liquidation is “X% likely.”

## 5. Continue

For a pooled provider, **Continue to provider** opens that provider’s official app. Recheck every field there—rates, collateral factors, caps, oracle state, available liquidity, approvals, gas, and transaction preview can change.

OWN has no public continuation action in this release. Its assessment route is
informational until the production policy is approved.

For an auditable operating record, keep the request time, resolved address, provider, block number, selected amount, displayed threshold metrics, source mode, and policy version. Re-run immediately before any action.
