# Runtime assumptions

This file identifies what is observed, what is policy, and what remains a modelling assumption.

## Public estimator

- Development defaults to `POWERRR_DATA_MODE=fixtures`; production defaults to `live`.
- Fixture results are examples, not current market quotes, and always return `productionSafe: false`.
- Live mode accepts only Ethereum mainnet and refuses quote provenance marked `fixture`, `fallback`, or `assumption`.
- Aave v3 and SparkLend capacity use their protocol data providers, native oracles, reserve configuration, user state, target reserve liquidity, and current variable rate.
- Compound III uses the Ethereum USDC Comet contract, configured price feeds, collateral factors, target liquidity, user debt, and current borrow-rate function.
- Morpho considers listed Ethereum isolated markets from the official GraphQL API, using market LLTV, price, liquidity, APY, and user-position fields.
- The production portfolio allowlist is WETH, wstETH, WBTC, cbBTC, USDC, DAI, and USDS. Holdings outside it are omitted from discovery, even if a protocol may support them.
- ENS support uses the registry and resolver `addr(bytes32)` path. Names requiring CCIP Read are rejected until an audited Universal Resolver flow is added.
- Live quote mode supports Aave v3, Morpho Blue, Compound III, and SparkLend. Aave v4 and Euler V2 are unavailable in live mode.
- OWN is returned separately as an `indicative-request` opportunity in fixture and live modes. It never enters executable `quotes` or affects `productionSafe`.
- OWN potential capacity uses policy `own-collateral-v1-2026-07-15`: eligible collateral, explicit advance rates and haircuts, a $500,000 per-family contribution limit, and a $750,000 maximum ticket.
- OWN verified liquidity defaults to $0. `availableNowUsd` is positive only when `OWN_AVAILABLE_LIQUIDITY_USD` is supplied by a verified server-side funding source.
- Initial OWN terms are an indicative 9.5% fixed APR and 24-month duration. They are configurable, subject to review and lender matching, and are not an executable quote.
- OWN risk is maturity default. Collateral price movement does not automatically trigger liquidation; collateral may be claimed after maturity/default under final documentation.
- “Safer estimate” applies a configured operating buffer; it is not a guarantee of transaction success or protection from liquidation.
- Public pooled-provider risk is threshold-only. The site does not estimate or display a probability of liquidation.

## Borrower-risk policy

- The active policy is `own-risk-2026-07-15`, status `provisional`.
- Supported collateral: ETH, WETH, BTC, WBTC, and SOL.
- Supported credit tokens: USD, USDC, DAI, and USDS.
- Maximum total stressed debt-service ratio: 36% of monthly gross income.
- Minimum residual income after living expenses, existing debt, and stressed proposed payment: $1,000 per month.
- Rate stress: +300 basis points. Income stress: -25%. Maximum term: 120 months. Minimum cure buffer: three stressed payments.
- Net income is required for a complete assessment. If absent, a conservative 70% of gross-income proxy is used only to calculate a review result; the recommendation cannot be within policy.
- Collateral recovery applies explicit liquidity, custody, oracle, liquidation-delay, volatility, and drawdown haircuts. A hedge floor is capped at spot value and cannot increase recovery above spot.
- A recognized `FICO 300-850` score can create review reasons below provisional thresholds. Other score scales are not mapped and do not change risk.
- Missing or stated-only evidence forces manual review. Unsupported collateral/credit token, zero repayment income, excessive term, or zero supported capacity is outside policy.
- PD and expected loss are `null`. They must not be populated from expert guesses or a minimum floor. A validated default/outcome dataset is required first.
- The output is decision support. A human remains responsible for identity, fraud, sanctions, legal enforceability, fair-lending, consumer-protection, custody, and final credit approval.

## Deterministic stresses

- Borrower stresses cover collateral crash, income loss, rate shock, liquidity freeze, and a combined event.
- Public quote stresses are standardized sensitivity tests, not transaction simulations, oracle forecasts, or liquidation forecasts.
- A stressed scenario is clamped so that displayed risk cannot improve and capacity cannot exceed the base result.
