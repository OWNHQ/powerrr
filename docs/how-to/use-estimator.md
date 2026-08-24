# How to use the borrowing estimator

Powerrr is a read-only comparison, not a loan approval or transaction builder.

## 1. Select wallet assets

Connect an Ethereum wallet and choose the assets to compare. Powerrr scans its
checked-in top-250 registry, values positive balances from pinned onchain reads,
and keeps unpriced or unsupported balances visible. Balances below $5 move into
“Small balances” only when at least one larger balance remains.

## 2. Compare protocols

The second screen has one global USDC amount input, one slider, and 25%, 50%,
and 75% projected-LTV scenario controls. The initial amount uses 50% projected
LTV against the accepted collateral of the highest-capacity available pooled
path, after accounting for existing debt. This is a convenience, not a
preferred borrowing level. The slider ceiling is the greater of selected asset
value or the highest pooled estimate; it is a comparison range, not approved
credit or a suggested borrowing amount.

Aave, Spark, Compound, and Morpho use the same amount. Expand any row—even an
unavailable one—to inspect:

- rate, weighted LTV, liquidation threshold or LLTV, and a color-coded projected health factor;
- eligible collateral, protocol limit, safety adjustment, liquidity, and the binding constraint; and
- contributing collateral assets, ordered by their USD contribution.

An RPC failure is labeled “Support could not be checked,” not “Unsupported.”

OWN is not included as a borrowing path in the current comparison. The footer
credits OWN as the builder and links to `https://own.casa`; Powerrr sends no
wallet data to that site.

Before acting, recheck the provider’s own interface because rates, factors,
liquidity, caps, and transaction requirements can change after the pinned block.
