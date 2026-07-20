## What changed

Describe the user-visible and technical changes.

## Correctness evidence

- [ ] Every displayed collateral match is adapter-confirmed.
- [ ] Rate convention and source are explicit.
- [ ] Missing or invalid prices do not contribute to capacity.
- [ ] Cache age is not described as source freshness.
- [ ] Partial upstream failures do not corrupt healthy quotes.

## Verification

- [ ] `pnpm check`
- [ ] `pnpm test:coverage`
- [ ] `pnpm build`
- [ ] `pnpm test:e2e`
- [ ] `pnpm audit --prod --audit-level high`
- [ ] Preview smoke test completed

## Release

- [ ] This remains a preview deployment unless production promotion is separately approved.
