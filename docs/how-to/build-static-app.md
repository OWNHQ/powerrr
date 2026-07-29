# Build and verify the static public app

The public Powerrr application is generated as ordinary HTML, CSS, JavaScript,
and local image files. It has no deployed server functions and does not contain
an RPC URL, API key, GraphQL endpoint, analytics client, or lead-submission
endpoint.

## Build

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build:static
```

The deployable directory is `apps/website/.output/public`. The build command
also writes `SHA256SUMS` inside that directory and rejects known server/API
dependencies in the generated text assets. Re-run the audit without rebuilding:

```bash
pnpm verify:static
```

Any static file server can serve the directory. Use the headers in
`vercel.json` as the minimum hosting baseline. The HTML also carries a CSP that
blocks page-originated network connections; EIP-1193 requests are handled by
the selected wallet extension or in-app browser.

## Runtime boundary

The user explicitly chooses an injected wallet. Powerrr then requests one
account, confirms Ethereum Mainnet, pins a recent block, verifies the canonical
Multicall3 deployment, and reads the checked-in token registry. The wallet's RPC
can observe these reads. Powerrr does not operate an intermediary and does not
persist the account, balances, quotes, or the user's choice to visit OWN's
external request form.

The interface follows the operating system's color preference until the user
chooses light or dark mode. That explicit preference is stored only in browser
local storage under `powerrr-theme`; it contains no account, balance, quote, or
request information and causes no network request.

At the pinned block, Powerrr also makes direct `eth_call` requests through the
wallet to the canonical ENS Universal Resolver and the .gwei NameNFT contract.
The .gwei namespace is resolved independently from ENS. There is no default
RPC, hosted name API, or HTTP/CCIP gateway; an ENS response that requires an
offchain lookup fails closed and the UI continues to show the wallet address.

The application never calls signing or transaction methods. Account or chain
changes invalidate the result. A stale block, missing Multicall3 contract,
malformed result, missing price, or provider failure is shown and fails closed.

## Registry updates

`ethereum-own-top100-2026-07-21-r2` is checked into `@powerrr/configs`. Updating it
requires a new version string, a dated source note, 100 unique mainnet contract
addresses, immutable symbol/decimal metadata, an explicit valuation route or
unavailable reason, OWN policy metadata, tests, and human review. The build must
not fetch token metadata or icons from the network.

## Content-addressed distribution

The generated directory is suitable for an IPFS import because routes and
assets are static. Publish the complete directory, retain `SHA256SUMS`, and
verify the imported files before announcing a CID. Use a CID-subdomain URL such
as `https://<CID>.ipfs.dweb.link/`; path-style gateway URLs are unsupported
because the app intentionally uses root-relative assets. See
[Release the static public app](deploy-live.md).
