# Risk methodology and limitations

Powerrr treats repayment capacity and collateral recovery as separate lines of defence. This follows a basic lending principle: recurring cash flow should support ordinary repayment, while collateral is a contingent recovery source. The model therefore constrains principal by both stressed affordability and recoverable collateral, then chooses the lower result.

## Public borrowing comparison

Aave, Spark, Compound, and Morpho use protocol-threshold calculations. The
final comparison displays the collateral included in the estimate, starting
debt, projected total debt, the rate with its APR or APY convention, projected
LTV, the value-weighted borrow limit, the value-weighted liquidation threshold,
and a common liquidation safety ratio. The ratio is weighted liquidation
capacity divided by projected debt, so `1.00` is the protocol boundary.

Powerrr assigns operational proximity labels to make amount changes visible:
`wide` at or above `1.60`, `reduced` from `1.20` through `1.59`, `thin` above
`1.00` and below `1.20`, and `at/above threshold` at or below `1.00`. These are
not probabilities, personalized recommendations, or universal safety bands.
Appropriate distance from liquidation still depends on collateral, price
correlation, volatility, oracle behavior, and the user's circumstances.

Wallet-estimate mode models a new position and does not include existing debt
the wallet may already have in a protocol. Existing-position mode includes the
debt reported by the adapter and labels it explicitly.

The provider-card estimate is not the raw protocol maximum. `safeBorrowUsd`
applies Powerrr's balanced safety profile and available-liquidity constraint, so
it can be lower than the displayed value-weighted protocol borrow limit.

OWN is intentionally different. Its underlying provisional model remains
versioned for policy work, but the public app does not publish numeric capacity,
APR, duration, or repayment projections until credit policy, funding limits,
and the contractual repayment convention are approved. The public route is
shown only as an assessment requiring review.

## Borrower and facility view

Affordability uses total monthly debt payments divided by gross monthly income plus a separate residual-income test. The policy owns its thresholds and records them by version; they are not presented as universal regulatory limits. This is consistent with the CFPB explanation that lenders may establish and document their own DTI or residual-income thresholds while considering both measures ([CFPB regulation and interpretation](https://www.consumerfinance.gov/rules-policy/regulations/1026/43/)).

The proposed payment is amortized and re-run with a 300-basis-point rate stress. Missing net income cannot produce an in-policy result. Verified arrears, defaults, bankruptcy, and a recognized FICO scale add transparent reason codes; unrecognized score scales are not silently normalized.

## Collateral and recovery view

Spot value is reduced for liquidity, custody, oracle, liquidation delay, volatility, and drawdown. EAD includes a small enforcement/interest uplift. LGD is the share of EAD not covered by effective stressed recovery. Basel describes PD, LGD, and EAD as distinct risk components and expected loss as PD × LGD × EAD ([Basel CRE35](https://www.bis.org/basel_framework/chapter/CRE/35.htm), [Basel CRI30](https://www.bis.org/basel_consolidated_guidelines/chapter/CRI/30.htm)).

Powerrr calculates EAD and LGD but leaves PD and expected loss null. A one-borrower score cannot be converted credibly into a probability without representative outcomes, a default definition, observation windows, calibration, back-testing, and independent validation. This avoids the false precision of the earlier grade-to-PD shortcut.

## Recommendations

- `within-policy`: verified required inputs and no detected provisional exception;
- `counteroffer`: a positive amount is supported, but below the request;
- `manual-review`: incomplete evidence or a material review condition;
- `outside-policy`: unsupported asset/token, no repayment income/capacity, or a hard term boundary.

None is an approval. OCC lending guidance emphasizes ongoing credit review and risk management across a loan's life cycle ([OCC 2026 lending booklet notice](https://www.occ.gov/news-issuances/bulletins/2026/bulletin-2026-29.html)). Powerrr currently covers origination decision support, not identity, fraud, legal enforceability, servicing, monitoring, collections, portfolio concentrations, capital, or accounting provisions.

## CROPS principles

The Ethereum Foundation uses CROPS for censorship resistance, open source, privacy, and security ([Ethereum Foundation mandate](https://ethereum.org/foundation/mandate)). CROPS is not a credit formula. Here it is used lightly as an engineering check: policy and reason codes are inspectable, collection is minimized, live data fails closed, and privileged endpoints are separated and authenticated.

## What validation must happen before real lending

1. Legal and compliance review for every borrower and lender jurisdiction.
2. Fair-lending and adverse-action review of inputs, thresholds, reason codes, and manual overrides.
3. A documented identity, fraud, sanctions, custody, valuation, and evidence-verification process.
4. Outcome capture with a fixed default definition and performance windows.
5. Calibration and holdout/back-testing of PD, recovery, counteroffers, and score bands.
6. Independent model validation, change approval, monitoring thresholds, and rollback.
7. Portfolio limits for single borrower, collateral family, custodian, oracle, and liquidity concentration.

Until those controls exist, keep the policy `provisional` and the system human-in-the-loop.
