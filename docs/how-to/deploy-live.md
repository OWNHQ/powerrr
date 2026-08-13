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

The checked-in Clarity project ID is `y177ongyf2`. Set
`NUXT_PUBLIC_CLARITY_PROJECT_ID` to an alternate ID when needed, or to an empty
value to disable Clarity for a build. Enable Consent Mode in Clarity with
analytics and advertising storage denied by default. The app also sends an
explicit denied Consent V2 state and masks the complete estimator surface.

## IPFS release

Create a restricted Pinata JWT with public upload, list, and delete/unpin
permissions. Add it as `PINATA_JWT` in a GitHub environment named
`production`, then require a reviewer for that environment.

Run the `release-ipfs` workflow from `main`. It builds without secrets, waits
for production approval, uploads only the checksum-verified static directory,
then browser-tests the returned CID subdomain, creates a GitHub Release, and
keeps three Powerrr pins. Folder upload is used because Pinata's current CAR
import requires a paid plan.

To publish the current checkout locally, put `PINATA_JWT` in the ignored
`.env` file and run:

```bash
pnpm check
pnpm test:coverage
pnpm audit --prod --audit-level high
pnpm deploy:pinata
```

`deploy:pinata` rebuilds and verifies the artifact immediately before upload.
It does not delete or replace earlier pins.

The immutable public URL is:

```text
https://<CID>.ipfs.inbrowser.link/
```

Use the CID-subdomain form. Root-relative Nuxt assets do not work through a
path-style URL such as `https://gateway.example/ipfs/<CID>`.

The GitHub Release contains the CID, commit, checksum manifest, and metadata.
The weekly `ipfs-availability` workflow checks the latest release. Public
gateways can be slow or unavailable; no paid fallback is configured.

## Rollback and recovery

Open either of the two previous GitHub Releases and use its immutable CID URL.
Never delete an older pin until the new release passes its remote browser test.

Cloudflare, DNS, and custom-domain configuration are deliberately out of
scope.
