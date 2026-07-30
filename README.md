# Powerrr

Powerrr is a static Ethereum borrowing-capacity estimator. It reads a user-selected wallet through that wallet's EIP-1193 provider, compares Aave v3, SparkLend, Compound III, and reviewed Morpho markets, and performs every calculation in browser memory.

There is no Powerrr backend, database, hosted RPC, analytics client, lead form, or internal underwriting application. The site never requests a signature or transaction and stores no wallet, estimate, or preference data.

## Run locally

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://127.0.0.1:3000` with an injected Ethereum wallet. Only Ethereum Mainnet is supported.

## Verify

```bash
pnpm check
pnpm test:coverage
pnpm build:static
pnpm verify:static
```

The deployable artifact is `apps/website/.output/public`.

## Documentation

- [Quickstart](docs/tutorials/quickstart.md)
- [Use the estimator](docs/how-to/use-estimator.md)
- [Build the static app](docs/how-to/build-static-app.md)
- [Deploy the static app](docs/how-to/deploy-live.md)
- [Asset registry](docs/explanation/asset-registry.md)
- [Runtime assumptions](ASSUMPTIONS.md)
