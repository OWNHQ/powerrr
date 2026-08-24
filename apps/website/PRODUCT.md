# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is a self-directed Ethereum holder who wants to understand how much USDC they could borrow against assets already in their wallet before choosing a lending market or deciding whether to proceed.

## Product Purpose

Powerrr helps users see how much they could borrow against crypto they already own, compare market rates and capacity, and understand liquidation risk before continuing. Success means the user can identify a viable next step without exposing wallet data to Powerrr. A quiet page-end credit identifies OWN as the builder without presenting OWN as a borrowing market.

## Positioning

Powerrr is a private borrowing comparison that shows which wallet assets lending markets may accept, how much each reviewed path can support, and how close a modeled position is to liquidation. Wallet discovery, pricing, protocol reads, and calculations remain local to the user's selected wallet provider.

## Operating Context

The user opens the static site with an injected Ethereum wallet on Ethereum Mainnet, connects read-only, selects collateral assets, chooses a USDC amount, and compares Aave v3, SparkLend, Compound III, and reviewed Morpho markets. The user can inspect collateral eligibility, capacity, rates, liquidity constraints, protocol thresholds, and risk before continuing to the linked lending platform.

## Capabilities and Constraints

- Ethereum Mainnet only.
- Static browser application with no Powerrr backend, database, hosted RPC, GraphQL client, lead form, or internal underwriting application. Public builds may use Microsoft Clarity with storage consent denied and the estimator surface masked.
- Wallet discovery, onchain names, prices, protocol state, and estimates use the user-selected EIP-1193 provider and a pinned recent block.
- The site never requests a signature or transaction and does not transmit or persist accounts, balances, quotes, preferences, or the user's choice to visit OWN. Clarity may receive cookieless interaction telemetry, but the complete estimator surface is explicitly masked and no custom wallet or estimate properties are sent.
- Comparisons cover Aave v3, SparkLend, Compound III, and reviewed Morpho USDC markets.
- OWN is not included as a borrowing market. A minimal bottom-right page credit links to its public site without sending wallet or estimate data.
- Estimates are comparisons, not approvals, guarantees of transaction success, liquidation protection, or personalized financial advice.
- Runtime asset discovery is deliberately finite and based on a checked-in, reviewed Ethereum token registry. Unsupported, unpriced, conversion-required, and failed-read assets remain explainable rather than being silently omitted.
- The supported public artifact is a checksum-verified static build suitable for IPFS deployment.

## Brand Commitments

The product name is Powerrr. Its product voice is direct, restrained, evidence-led, and explicit about uncertainty. Privacy and read-only behavior are core trust commitments. OWN appears only as a restrained builder credit at the bottom-right of the page.

The official OWN wordmark is stored at `public/brands/own.svg` with provenance documented in `public/brands/README.md`.

## Evidence on Hand

- Product and runtime behavior: `../../README.md` and `../../ASSUMPTIONS.md`.
- User workflow and limitations: `../../docs/how-to/use-estimator.md`.
- Static build, privacy, and deployment constraints: `../../docs/how-to/build-static-app.md` and `../../docs/how-to/deploy-live.md`.
- Reviewed asset-registry method and scope: `../../docs/explanation/asset-registry.md` and `../../packages/configs/src/index.ts`.
- Incumbent product copy and workflow implementation: `app.vue` and `components/`.
- Automated evidence includes unit tests plus end-to-end checks for read-only behavior, mobile usability, and detectable WCAG A/AA violations in `../../tests/e2e/apps.spec.ts`.
- The confirmed product requirement is to omit OWN from borrowing markets and show a minimal linked OWN builder credit at the bottom-right of the page.
- No testimonials, customer claims, approval rates, conversion benchmarks, pricing promises, or underwriting commitments are currently on hand and must not be fabricated.

## Product Principles

1. Keep the user's wallet private: derive useful comparisons locally without creating a Powerrr data trail.
2. Make uncertainty inspectable: show sources, constraints, exclusions, stale data, and unsupported paths instead of overstating precision.
3. Compare paths on equal terms: use one requested amount and present pooled protocols without manufactured preference.
4. Help users assess risk before action: distinguish protocol capacity from safer operating estimates and avoid implying approval or advice.
5. Stay independently verifiable: ship a static, checksum-verified artifact whose behavior can be tested without trusting a Powerrr service.
6. Lead with the user outcome: show what the wallet enables and what happens next before exposing implementation details or protocol terminology.

## Accessibility & Inclusion

The web experience must meet WCAG 2 AA expectations, remain keyboard operable, expose meaningful status and error changes to assistive technology, respect reduced-motion preferences, use a deliberate light-only color scheme, and remain usable on phone viewports.
