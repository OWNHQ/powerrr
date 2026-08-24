# Powerrr

Powerrr is a static Ethereum borrowing-capacity estimator. It scans a connected wallet and compares indicative USDC borrowing terms across Aave v3, SparkLend, Compound III, and a reviewed set of Morpho markets.

The application is a Nuxt/Vue single-page app with no Powerrr backend. Protocol and wallet state is read through the selected wallet's EIP-1193 provider, pinned to one Ethereum block, and processed in browser memory. The provider wrapper permits only account discovery, chain selection, block reads, balance reads, bytecode reads, and `eth_call`; signing and transaction methods are rejected.

## Workspace

- `apps/website` — static Nuxt application
- `packages/configs` — reviewed Ethereum asset and Morpho market registries
- `packages/math` — fixed-point borrowing calculations and formatting
- `packages/protocol-adapters` — Aave, Spark, Compound, and Morpho readers
- `packages/shared-types` — shared domain types
- `tooling` — registry audits, artifact verification, and IPFS release tooling

All workspace packages are internal implementation modules and are not published to npm.

## Development

Requires Node.js 22 and pnpm 10.15.1.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://127.0.0.1:3000` with an injected Ethereum wallet.

## Verification

```bash
pnpm check
pnpm test:coverage
pnpm licenses:check
pnpm audit --prod --audit-level high
pnpm verify:morpho-registry
pnpm build:static
pnpm verify:static
pnpm test:e2e
```

`pnpm check` runs linting, formatting, type checking, unused-code analysis, and unit tests. The deployable static artifact is written to `apps/website/.output/public` with a `SHA256SUMS` manifest.

## Limitations

- Ethereum Mainnet only
- USDC borrowing only
- Indicative estimates rather than executable quotes
- Requires an injected EIP-1193 wallet provider
- Supports only the checked-in asset and Morpho market registries

## Documentation

- [Runtime assumptions](ASSUMPTIONS.md)
- [Build the static application](docs/how-to/build-static-app.md)
- [Release and deploy](docs/how-to/deploy-live.md)
- [Asset registry](docs/explanation/asset-registry.md)

## License

Powerrr source code is available under the [MIT License](LICENSE). Third-party names, trademarks, and visual assets are described in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and are not granted under the MIT License.

This repository is published without a support commitment and does not solicit unsolicited contributions.
