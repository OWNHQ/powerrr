# Run the Powerrr estimator

## 1. Install and verify

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
```

## 2. Start the site

```bash
pnpm dev
```

Open `http://127.0.0.1:3000` with an injected Ethereum wallet. Connect, select collateral, choose a USDC amount, and compare Aave, Spark, Compound, and Morpho.

Powerrr reads through the selected wallet provider only. It does not request a signature or transaction and does not send the wallet or estimate to a Powerrr server.

## 3. Build the static artifact

```bash
pnpm build:static
pnpm verify:static
```

Serve `apps/website/.output/public` with any static file server.
