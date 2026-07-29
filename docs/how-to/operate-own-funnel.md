# How to operate the OWN request path

The secondary OWN row is a request path, not a liquidity or approval claim. Its
job is to show an honest collateral-based potential after the immediately
available providers, explain the fixed-term risk model, and let the user choose
whether to visit OWN's borrower intake. Powerrr does not capture or transmit a
lead.

## Configure the opportunity

The static public app uses the checked-in OWN opportunity policy. Its defaults
are zero verified liquidity, 6.5% illustrative APR, and a 24-month illustrative
duration. Changing those values requires a reviewed code and policy update; do
not treat runtime environment variables as a source of public-app funding.

Keep available liquidity at zero unless a verified funding source supports a
higher value. The amount is capped by the versioned collateral policy before
liquidity is applied. APR and duration are illustrative configuration, not
borrower-specific pricing.

## Maintain the handoff

The only public action is **Request with OWN**, which opens
`https://own.casa/borrow#contact` in a new tab. Keep the URL free of query
parameters: do not send the wallet, amount, collateral, policy version, or
other estimate data. OWN's website owns consent and intake from that point.

Keep the compact row factual and quiet: fixed-term borrowing, the applicable
funding status, indicative request potential, and the review action. Detailed
terms and risk mechanics appear only after intentional selection.
