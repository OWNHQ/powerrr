# How to use the borrowing estimator

Powerrr is a read-only comparison, not a loan approval or transaction builder.

## 1. Select wallet assets

Connect an Ethereum wallet and choose the assets to compare. Powerrr scans its
checked-in top-250 registry, values positive balances from pinned onchain reads,
and keeps unpriced or unsupported balances visible. Balances below $5 move into
“Small balances” only when at least one larger balance remains.

## 2. Compare protocols

The second screen has one global USDC amount input and one slider. The slider
ceiling is the greater of selected asset value or the highest pooled estimate;
it is a comparison range, not approved credit.

Aave, Spark, Compound, and Morpho use the same amount. Expand any row—even an
unavailable one—to inspect:

- recommended capacity, rate, weighted LTV, liquidation threshold or LLTV, and projected health factor;
- eligible collateral, protocol limit, safety adjustment, liquidity, and the binding constraint; and
- every positive wallet asset, including supported-but-unselected, unsupported, conversion-required, small, and unpriced balances.

An RPC failure is labeled “Support could not be checked,” not “Unsupported.”

OWN appears only above a $5,000 request. Every wallet asset is eligible for an
OWN assessment, but the estimator does not invent capacity, LTV, liquidation
terms, or a rate. **Contact OWN** opens
`https://own.casa/borrow#contact`; Powerrr sends no wallet data to that site.

Before acting, recheck the provider’s own interface because rates, factors,
liquidity, caps, and transaction requirements can change after the pinned block.
