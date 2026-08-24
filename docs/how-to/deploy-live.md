# Release the static public app

The supported public deployment is the verified static artifact in
`apps/website/.output/public`. It has no Powerrr server, public RPC fallback,
GraphQL client, or lead-submission endpoint. A release may optionally include
Microsoft Clarity in masked, cookieless mode.

## Build and verify

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm test:coverage
pnpm audit --prod --audit-level high
pnpm build:static
pnpm verify:static
```

`build:static` writes `SHA256SUMS`. `verify:static` independently recomputes
every file digest and fails if the artifact changed after the build.

## Vercel preview

Import the repository root, not `apps/website`. `vercel.json` runs the same
verified static build and publishes `apps/website/.output/public`.

Vercel is preview-only: do not attach a custom domain. Configure an unused,
protected branch such as `vercel-production-disabled` as the Vercel Production
Branch so normal branches receive preview URLs. Vercel Hobby may only be used
while Powerrr is personal and non-commercial.

Set `NUXT_PUBLIC_CLARITY_PROJECT_ID` in the deployment environment to enable
Clarity for an official build. Leaving the variable unset disables Clarity.
Enable Consent Mode in Clarity with
analytics and advertising storage denied by default. The app also sends an
explicit denied Consent V2 state and masks the complete estimator surface.

## IPFS release

Create a restricted Pinata JWT with public upload, list, and delete/unpin
permissions. IPFS deployments are intentionally manual; there is no GitHub
Actions deployment or availability workflow. Put `PINATA_JWT` in the ignored
`.env` file and run from a clean `main` checkout:

```bash
pnpm check
pnpm test:coverage
pnpm audit --prod --audit-level high
pnpm deploy:pinata
```

`deploy:pinata` rebuilds and verifies the artifact immediately before upload.
It does not delete or replace earlier pins.

Before deleting any old pin, resolve `https://powerrr.eth.limo/` and preserve
the CID reported by its `X-Ipfs-Roots` response header. A failed lookup must
stop cleanup rather than permit deletion.

The immutable public URL is:

```text
https://<CID>.ipfs.dweb.link/
```

The static build uses relative asset paths, so it works through this
CID-subdomain URL as well as path-style gateways.

Record the CID, source commit, and generated `SHA256SUMS` with the release.
Public gateways can be slow or unavailable; no paid fallback is configured.

## Rollback and recovery

Open either of the two previous GitHub Releases and use its immutable CID URL.
Never delete an older pin until the new release passes its remote browser test.

Cloudflare, DNS, and custom-domain configuration are deliberately out of
scope.
