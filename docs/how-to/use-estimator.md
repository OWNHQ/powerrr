# How to use the borrowing estimator

Use the estimator to see what a wallet may support, compare the risk mechanics of each venue, and move to the right next step. It does not approve a loan or submit a transaction.

## 1. Load a wallet

Paste an Ethereum address or ENS name, or connect a browser wallet. Powerrr only reads the selected address; it never requests a signature or transaction.

The first panel lists the supported assets found in the wallet, their discovery values, and how many displayed providers can use each asset. Assets outside the Ethereum allowlist are not included in this release.

Always check the header badge:

- **Live data** means executable protocol rows were built from approved live sources.
- **Demo data** means deterministic examples. Do not use them for a real decision.

## 2. Choose OWN or a live provider

OWN is always featured first because it is Powerrr’s fixed-term request path.

- **Available now**: verified committed OWN funding covers the indicative capacity.
- **Limited availability**: verified funding covers only part of the indicative capacity.
- **Request required**: collateral may support an amount, but no committed funding currently covers it.
- **Unavailable**: the wallet has no collateral supported by the current OWN policy.

“Up to $X may be possible” is a collateral-policy estimate, not an executable quote, approval, or promise of funding. OWN requests remain subject to review, lender matching, and final documentation.

Aave, Spark, Compound, and Morpho appear below OWN and are ordered by estimated safer capacity. Their amounts are live protocol quote rows when the header says **Live data**.

## 3. Set an amount and read the right risk view

Move the slider or choose a preset.

For Aave, Spark, Compound, and Morpho, Powerrr shows:

- projected debt after the selected borrow;
- current LTV;
- health factor or Compound liquidation ratio;
- borrowing-power usage; and
- the proportional collateral decline that reaches the current liquidation threshold.

These are threshold calculations, not a probability forecast. Powerrr deliberately does not claim that liquidation is “X% likely.”

For OWN, the panel changes to:

- indicative LTV;
- fixed APR;
- fixed duration;
- estimated total amount due at maturity; and
- the funding state for the selected amount.

OWN positions do not automatically liquidate because the collateral price moves. If the loan is not repaid by maturity and enters default, the lender may claim the pledged collateral under the final agreement.

## 4. Continue

For a pooled provider, **Continue to provider** opens that provider’s official app. Recheck every field there—rates, collateral factors, caps, oracle state, available liquidity, approvals, gas, and transaction preview can change.

For OWN, **Request an OWN offer** opens the in-site form. Email and consent are required; wallet, amount, USDC, term, and collateral summary are prefilled. Submitting the form shares those details with the OWN team. It still does not create a loan or guarantee an offer.

For an auditable operating record, keep the request time, resolved address, provider, block number, selected amount, displayed threshold metrics, source mode, and policy version. Re-run immediately before any action.
