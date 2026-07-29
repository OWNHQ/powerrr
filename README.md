# Powerrr

Powerrr is an Ethereum borrowing-capacity comparator plus a separate borrower-risk workbench. The public Nuxt site is a static, connected-wallet application: all account, balance, oracle, provider, ENS, and .gwei name reads go through the wallet's EIP-1193 provider and calculations remain in browser memory. Only an explicit light or dark theme preference is stored locally; it contains no wallet or estimate data. The internal Nuxt app separately assesses a proposed amortizing loan from verified affordability, credit-history, facility, collateral, and recovery inputs.

The codebase deliberately separates three things that are often blurred together:

- protocol capacity: what a venue's current collateral rules and liquidity may permit;
- safer operating capacity: a buffered estimate below the protocol edge;
- borrower risk: whether a specific person appears able to repay a proposed term loan.

Fixture mode is deterministic and clearly labelled as demo-only. Live mode
returns healthy providers independently, marks failed exact sources unavailable,
and rejects fixture, fallback, or assumption provenance.

## Five-minute start

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev:website
```

Open `http://127.0.0.1:3000` with an injected Ethereum wallet. Connecting is explicit, only Ethereum Mainnet is accepted, and the application never asks for a signature or transaction. Run the internal workbench separately:

```bash
pnpm dev:internal-underwriter
```

Open `http://127.0.0.1:3001`, choose an example, run the assessment, and then run all stresses.

## Verification

```bash
pnpm check
pnpm build
pnpm build:static
```

## Documentation

- [Quickstart](docs/tutorials/quickstart.md)
- [Build and verify the static public app](docs/how-to/build-static-app.md)
- [Use the borrowing estimator](docs/how-to/use-estimator.md)
- [Operate the OWN request path](docs/how-to/operate-own-funnel.md)
- [Assess a loan](docs/how-to/assess-a-loan.md)
- [Release the static app to Vercel preview and IPFS](docs/how-to/deploy-live.md)
- [Operate and recover the service](docs/runbooks/operations.md)
- [API reference](docs/reference/api.md)
- [Risk methodology and limitations](docs/explanation/risk-methodology.md)
- [Curated Ethereum asset registry](docs/explanation/asset-registry.md)
- [Runtime assumptions](ASSUMPTIONS.md)

## Live coverage

The public app checks Aave v3, SparkLend, and Compound III directly through the selected wallet provider at the same pinned block as portfolio discovery. Morpho fails closed unless a reviewed market ID is present in the checked-in static manifest; there is no GraphQL or generic RPC fallback.

Optional ENS and .gwei primary-name labels are resolved with direct contract
calls through that same wallet provider and pinned block. Powerrr does not use a
hosted name API or HTTP/CCIP gateway; unsupported or offchain-dependent names
fail closed to the abbreviated wallet address.

OWN is not an executable protocol quote. It is calculated locally as a versioned, collateral-only `indicative-request` opportunity and displayed separately from immediately available providers. The public app collects no email, submits no lead, and passes no wallet or estimate data to OWN; a user who intentionally selects the fixed-term option can open OWN's external borrower request form.

The internal risk policy is versioned as `own-risk-2026-07-15` and remains `provisional`. It reports EAD and recovery-based LGD, but intentionally leaves PD and expected loss blank until a representative outcomes dataset has been independently validated.
