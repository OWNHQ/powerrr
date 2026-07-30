# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is a self-directed Ethereum holder who wants to understand how much USDC they could borrow against assets already in their wallet before choosing a provider or deciding whether to proceed.

## Product Purpose

Powerrr helps users inspect usable collateral, compare borrowing capacity and terms across available paths, and understand threshold-based risk before borrowing. Success means the user can make an informed next-step decision without exposing wallet data to Powerrr. Generating qualified interest for OWN is also a product outcome, but OWN must remain one option in the comparison rather than an upsold or marketing-led destination.

## Positioning

Powerrr is a privacy-preserving borrowing-capacity comparison that performs wallet discovery, pricing, protocol reads, and calculations locally through the user's selected wallet provider. It combines pooled-protocol comparisons with a direct fixed-term assessment path while transmitting neither the wallet nor the estimate to Powerrr or OWN.

## Operating Context

The user opens the static site with an injected Ethereum wallet on Ethereum Mainnet, connects read-only, selects collateral assets, chooses a USDC amount, and compares Aave v3, SparkLend, Compound III, reviewed Morpho markets, and—when the request exceeds $1,000—OWN. The user can inspect collateral eligibility, capacity, rates, liquidity constraints, protocol thresholds, and risk before continuing to a provider's own interface or OWN's public contact page.

## Capabilities and Constraints

- Ethereum Mainnet only.
- Static browser application with no Powerrr backend, database, hosted RPC, GraphQL client, analytics client, lead form, or internal underwriting application.
- Wallet discovery, onchain names, prices, protocol state, and estimates use the user-selected EIP-1193 provider and a pinned recent block.
- The site never requests a signature or transaction and does not transmit or persist accounts, balances, quotes, preferences, or the user's choice to visit OWN.
- Comparisons cover Aave v3, SparkLend, Compound III, reviewed Morpho USDC markets, and OWN as a direct fixed-term assessment path.
- OWN appears when the requested amount is greater than $1,000. It is presented as one neutral option, not as a preferred or aggressively marketed route. Capacity, pricing, repayment, accepted collateral, and funding remain subject to direct assessment by OWN.
- Estimates are comparisons, not approvals, guarantees of transaction success, liquidation protection, or personalized financial advice.
- Runtime asset discovery is deliberately finite and based on a checked-in, reviewed Ethereum token registry. Unsupported, unpriced, conversion-required, and failed-read assets remain explainable rather than being silently omitted.
- The supported public artifact is a checksum-verified static build suitable for IPFS deployment.

## Brand Commitments

The product name is Powerrr. Its product voice is direct, restrained, evidence-led, and explicit about uncertainty. Privacy and read-only behavior are core trust commitments. OWN must be described accurately and neutrally as a direct fixed-term assessment option; qualified interest should come from relevance and clarity, not sales pressure.

The official OWN wordmark is stored at `public/brands/own.svg` with provenance documented in `public/brands/README.md`.

## Evidence on Hand

- Product and runtime behavior: `../../README.md` and `../../ASSUMPTIONS.md`.
- User workflow and limitations: `../../docs/how-to/use-estimator.md`.
- Static build, privacy, and deployment constraints: `../../docs/how-to/build-static-app.md` and `../../docs/how-to/deploy-live.md`.
- Reviewed asset-registry method and scope: `../../docs/explanation/asset-registry.md` and `../../packages/configs/src/index.ts`.
- Incumbent product copy and workflow implementation: `app.vue` and `components/`.
- Automated evidence includes unit tests plus end-to-end checks for read-only behavior, mobile usability, and detectable WCAG A/AA violations in `../../tests/e2e/apps.spec.ts`.
- The incumbent code and documentation currently use a $5,000 OWN threshold. The confirmed product requirement is greater than $1,000; future implementation and documentation work must use the confirmed requirement.
- No testimonials, customer claims, approval rates, conversion benchmarks, pricing promises, or underwriting commitments are currently on hand and must not be fabricated.

## Product Principles

1. Keep the user's wallet private: derive useful comparisons locally without creating a Powerrr data trail.
2. Make uncertainty inspectable: show sources, constraints, exclusions, stale data, and unsupported paths instead of overstating precision.
3. Compare paths on equal terms: use one requested amount and present pooled protocols and OWN without manufactured preference.
4. Help users assess risk before action: distinguish protocol capacity from safer operating estimates and avoid implying approval or advice.
5. Stay independently verifiable: ship a static, checksum-verified artifact whose behavior can be tested without trusting a Powerrr service.

## Accessibility & Inclusion

The web experience must meet WCAG 2 AA expectations, remain keyboard operable, expose meaningful status and error changes to assistive technology, respect reduced-motion preferences, use a deliberate light-only color scheme, and remain usable on phone viewports.
