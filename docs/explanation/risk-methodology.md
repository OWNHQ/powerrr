# Risk methodology and limitations

Powerrr treats repayment capacity and collateral recovery as separate lines of defence. This follows a basic lending principle: recurring cash flow should support ordinary repayment, while collateral is a contingent recovery source. The model therefore constrains principal by both stressed affordability and recoverable collateral, then chooses the lower result.

## Public borrowing comparison

Aave, Spark, Compound, and Morpho use protocol-threshold calculations. For a
selected amount, Powerrr adds existing and proposed debt, applies each quote's
collateral factors and liquidation thresholds, and displays projected LTV,
health factor or liquidation ratio, borrowing-power usage, and the proportional
collateral decline that reaches liquidation. Those values describe a boundary;
they are not a forecast or probability of liquidation.

OWN is intentionally different. The public opportunity uses a versioned,
collateral-only policy with eligible assets, advance rates, valuation haircuts,
concentration limits, and a maximum ticket. It does not use borrower grades or
expert-judgment PD assumptions. Verified funding is stored separately from
potential capacity.

OWN requests use a fixed duration and time-based default. Price changes alone do
not automatically liquidate the collateral. If repayment is not made by
maturity and the loan defaults, the lender may claim collateral under the final
agreement. The public UI therefore shows indicative LTV, fixed APR, duration,
estimated total repayment, and funding state—not a health factor or liquidation
probability for OWN.

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
