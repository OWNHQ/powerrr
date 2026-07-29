# Powerrr public estimator audit

## Scope

Combined UX, visual, responsive, accessibility, product-logic, and implementation review of the public wallet-estimate flow in fixture and live Ethereum modes. The primary user goal is to understand supported collateral, compare credible borrowing paths, review the risk model for a selected amount, and take an appropriate next step.

## Flow evidence

1. `before/01-estimate-desktop.png` — Full desktop estimate. **Healthy foundation.** Clear hierarchy, restrained visual language, and unusually good provenance/risk disclosure for a finance product. The long page remains scannable, but the original OWN-first selection conflicts with the visible “Highest capacity” provider and can feel commercially biased.
2. `before/02-mobile-summary.png` — Mobile result summary and collateral. **Mostly healthy.** The key answer is visible early and tap targets are generous. The three-step navigation is cramped, and the summary grid had internal width pressure at 390px.
3. `before/03-mobile-providers.png` — Mobile comparison. **Needs product clarification.** OWN is distinctive and positive, but “Featured” plus automatic selection reads like promotion. Calling the whole set “providers” also blurs a tailored OWN request with executable pooled-protocol estimates.
4. `before/04-mobile-amount-risk.png` — Mobile amount and risk review. **Good interaction, dense explanation.** The amount presets and range control are easy to operate. The fixed-term heading and metrics need more compact mobile treatment, and “Total due” is too definitive for a simple-interest indicative calculation.
5. `before/05-own-request-mobile.png` and `before/06-own-request-consent-mobile.png` — OWN request form. **Strong.** The form is focused, prefilled, transparent about consent, keyboard-dismissable, and clear that submission is not approval. The collateral summary is detailed but still manageable on mobile.

## Highest-impact findings

- Preserve trust by defaulting to the strongest executable provider estimate; keep OWN first and visually distinct, but require an intentional selection.
- Describe the section as “borrowing paths” and explicitly distinguish a tailored fixed-term request from pooled variable-rate estimates.
- Replace promotional status language with factual product language: “Fixed term” and “Open for requests.” Never render OWN as unavailable or as a zero-dollar row; use an informational private-credit card when requests are not actionable.
- Make the initial screen specific and sober. Explain the estimator’s actual job instead of using a generic “unlock” promise.
- Treat the OWN repayment total as indicative and disclose the simple-interest assumption.
- Reduce mobile width pressure in the summary, progress row, and risk metrics without changing the established visual system.

## Implemented outcome

1. `after/00-live-entry-desktop.png` and `after/07-production-entry.png` — **Healthy.** The entry screen now states the concrete job, avoids inflated claims, and makes the read-only safety model explicit.
2. `after/01-estimate-desktop.png`, `after/02-mobile-summary.png`, and `after/09-production-mobile-result.png` — **Healthy.** Result hierarchy is clearer and the summary, progress row, collateral grid, and account control reflow cleanly at 390px.
3. `after/03-mobile-borrowing-paths.png` — **Healthy.** OWN remains visually distinctive and consistently positive, while the section now separates a tailored fixed-term request from pooled variable-rate options. The default is the best current, high-confidence executable estimate rather than OWN or a stale headline maximum.
4. `after/04-mobile-amount-risk.png` — **Healthy.** The controls retain generous targets, the mobile risk panel is less cramped, and fixed-term totals are explicitly indicative simple-interest estimates.
5. `after/08-production-live-result.png` — **Healthy with source caveat.** A production estimate for a real public wallet returned matched collateral and four borrowing options; fresh high-confidence on-chain reads correctly took precedence over a stale medium-confidence estimate. Source freshness remains dependent on upstream RPC and protocol APIs.

Production verification was performed at `https://powerrr-ten.vercel.app` after a single production deployment. The Alchemy key is stored only as a sensitive server-side Vercel environment variable and is not present in the repository.

## Accessibility evidence and limits

The captured flow shows semantic headings, labelled regions, visible focus treatment, 44px-plus primary targets, status text that does not rely on color alone, reduced-motion support, and a modal with focus return and Escape handling. Screenshot evidence cannot establish full keyboard behavior, screen-reader output, zoom reflow, or WCAG compliance; automated axe coverage and hands-on keyboard checks remain required in verification.
