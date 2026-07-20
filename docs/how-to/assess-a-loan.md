# How to assess a loan

The internal workbench is most useful as a structured underwriting checklist with calculations attached.

## Prepare evidence

Collect only what is necessary and record whether each source is verified, stated, or missing:

- gross and net recurring income;
- existing required monthly debt payments and normal living expenses;
- employment status;
- credit score plus its exact scale, missed payments, defaults/collections, and bankruptcy status;
- proposed principal, annual rate, amortizing term, and credit token;
- collateral quantity, current price, volatility, drawdown, market volume, custody, oracle method, and any enforceable hedge floor.

Do not mark user-entered values as verified. Retain source documents outside this application under your access-control and retention policy; the workbench is not a document vault.

## Run and interpret

1. Enter the facility and borrower evidence.
2. Run the base assessment.
3. Read the recommendation together with every reason code. `within-policy` means no provisional exception was detected; it is not approval. `counteroffer` gives the lower of affordability and collateral capacity. `manual-review` means evidence or risk needs a person. `outside-policy` means a hard boundary was crossed.
4. Confirm stressed debt service and residual income. These are the primary repayment view; collateral is a secondary recovery view.
5. Review maximum LTV, stressed value, effective recovery, and cure months. Do not substitute spot collateral value for recoverable value.
6. Run all scenarios. Focus on combined-stress capacity and the reason codes newly introduced by the stress.
7. Record a human decision, the policy version, exceptions, evidence references, and decision owner in your system of record.

## Decision rules

- Never approve automatically from this output.
- Never fill in PD or expected loss manually just to complete a report.
- Re-run if the facility, income, debts, collateral price, custody, or policy version changes.
- Escalate identity, fraud, sanctions, legal, fair-lending, bankruptcy, custody-enforceability, and jurisdiction questions to qualified specialists.
- Monitor approved loans separately; this application does not service loans or detect delinquency.
