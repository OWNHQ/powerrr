# Build and verify the static public app

The public Powerrr application is generated as ordinary HTML, CSS, JavaScript,
and local image files. It has no deployed server functions and does not contain
an RPC URL, API key, GraphQL endpoint, or lead-submission endpoint. Microsoft
Clarity is enabled with the public Powerrr project ID.

## Build

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build:static
```

The checked-in Clarity project ID is `y177ongyf2`. To build without Clarity,
explicitly provide an empty value:

```bash
NUXT_PUBLIC_CLARITY_PROJECT_ID= pnpm build:static
```

An alternate project ID may be supplied with the same variable and may contain
only letters and numbers. The bootstrap uses Clarity Consent V2 to deny both
analytics and advertising storage, and the complete estimator surface has
`data-clarity-mask`. Powerrr does not send custom identifiers, tags, or events.

The deployable directory is `apps/website/.output/public`. The build command
also writes `SHA256SUMS` inside that directory and rejects known server/API
dependencies in the generated text assets. Re-run the audit without rebuilding:

```bash
pnpm verify:static
```

Any static file server can serve the directory. Use the headers in
`vercel.json` as the minimum hosting baseline. The HTML also carries a CSP that
blocks page-originated network connections except Clarity when analytics was
enabled for the build; EIP-1193 requests are handled by the selected wallet
extension or in-app browser.

## Runtime boundary

The user explicitly chooses an injected wallet. Powerrr then requests one
account, confirms Ethereum Mainnet, pins a recent block, verifies the canonical
Multicall3 deployment, and reads the checked-in token registry. The wallet's RPC
can observe these reads. Powerrr does not operate an intermediary and does not
persist the account, balances, quotes, or the user's choice to visit OWN's
external request form.

The interface uses one deliberate light color scheme and does not persist a
theme or other local preference.

At the pinned block, Powerrr also makes direct `eth_call` requests through the
wallet to the canonical ENS Universal Resolver and the .gwei NameNFT contract.
The .gwei namespace is resolved independently from ENS. There is no default
RPC, hosted name API, or HTTP/CCIP gateway; an ENS response that requires an
offchain lookup fails closed and the UI continues to show the wallet address.

The application never calls signing or transaction methods. Account or chain
changes invalidate the result. A stale block, missing Multicall3 contract,
malformed result, missing price, or provider failure is shown and fails closed.

## Registry updates

`ethereum-top250-2026-07-29-v1` is checked into `@powerrr/configs`. Updating it
requires a new version string, a dated source snapshot, at least 250 unique
checksummed mainnet contracts, immutable symbol/decimal metadata, tests, and
human review. The deployed application must not fetch token metadata, rankings,
or icons from the network. Run `pnpm report:token-coverage` before release.

## Content-addressed distribution

The generated directory is suitable for an IPFS import because routes and
assets are static. Publish the complete directory, retain `SHA256SUMS`, and
verify the imported files before announcing a CID. Use a CID-subdomain URL such
as `https://<CID>.ipfs.inbrowser.link/`; path-style gateway URLs are unsupported
because the app intentionally uses root-relative assets. See
[Release the static public app](deploy-live.md).
