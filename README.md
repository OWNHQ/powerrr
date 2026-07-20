# Powerrr

Powerrr is an Ethereum borrowing-capacity comparator plus a separate borrower-risk workbench. The public Nuxt site shows provider-matched assets, features OWN as an indicative fixed-term request opportunity, compares live pooled providers, and previews threshold-based risk from an address or ENS name. The internal Nuxt app assesses a proposed amortizing loan from verified affordability, credit-history, facility, collateral, and recovery inputs.

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

Open `http://127.0.0.1:3000`. The default development mode uses the included examples. Run the internal workbench separately:

```bash
pnpm dev:internal-underwriter
```

Open `http://127.0.0.1:3001`, choose an example, run the assessment, and then run all stresses.

## Verification

```bash
pnpm check
pnpm build
```

## Documentation

- [Quickstart](docs/tutorials/quickstart.md)
- [Use the borrowing estimator](docs/how-to/use-estimator.md)
- [Operate the OWN request funnel](docs/how-to/operate-own-funnel.md)
- [Assess a loan](docs/how-to/assess-a-loan.md)
- [Deploy live mode](docs/how-to/deploy-live.md)
- [Operate and recover the service](docs/runbooks/operations.md)
- [API reference](docs/reference/api.md)
- [Risk methodology and limitations](docs/explanation/risk-methodology.md)
- [Curated Ethereum asset registry](docs/explanation/asset-registry.md)
- [Runtime assumptions](ASSUMPTIONS.md)

## Live coverage

Exact live adapters are implemented for Aave v3 Ethereum Core, Morpho Blue, Compound III USDC Comet, and SparkLend. Aave v4 and Euler V2 remain disabled until their venue-specific semantics are implemented and tested; they are never replaced with approximate fixture numbers in live mode.

OWN is not an executable protocol quote. It is returned separately as a
versioned, collateral-only `indicative-request` opportunity. Verified liquidity
defaults to zero, and production lead submission fails closed unless its signed
server webhook is configured.

The internal risk policy is versioned as `own-risk-2026-07-15` and remains `provisional`. It reports EAD and recovery-based LGD, but intentionally leaves PD and expected loss blank until a representative outcomes dataset has been independently validated.
