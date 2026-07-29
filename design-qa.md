# OWN row interaction and alignment design QA

## Inputs

- Source visual truth: `/var/folders/br/kz99s6596yq566y9y464hy2c0000gn/T/codex-clipboard-2a316b8f-d4c2-4361-a363-12045324b7c5.png`
- Browser-rendered implementation: `/private/tmp/powerrr-own-row-implementation.png`
- Source pixels: 2750 × 696.
- Implementation capture: 1296 × 602 pixels, captured from a 2048 × 1000 CSS px viewport at device scale factor 1.
- State: the reference has available provider cards with Morpho selected. The mocked-wallet implementation fixture has unavailable provider cards and OWN unselected under the pointer. The scoped OWN-row layout, radio alignment, and click target are directly comparable; provider availability styling is not.

## Findings

- No actionable P0/P1/P2 mismatch remains for the requested change.
- The OWN row is one full-width semantic button. Its identity, status, and indicative-potential columns share the same click target.
- The OWN selection circle now uses the provider cards' 16 px content inset. Browser geometry measured the OWN and Aave indicators at the same horizontal coordinate within 1 CSS px.
- Fonts and typography retain the existing estimator hierarchy and weights.
- Spacing and layout rhythm match the provider grid: the radio, wordmark, and text now begin on the same content line as the provider-card controls, while the three-column row remains balanced.
- Colors and visual tokens reuse the existing neutral surface, hairline border, focus ring, and restrained hover tint.
- Image quality and asset fidelity are unchanged; the existing official OWN wordmark remains intact.
- Copy and content are unchanged.

## Interaction and accessibility

- Clicking the far-right “Indicative request potential” content selects OWN, proving the complete row is interactive rather than only the left identity cluster.
- The control retains its stable accessible name, native button keyboard behavior, disabled behavior, focus ring, and `aria-pressed` selection state.
- The focused browser regression covers unselected-to-selected behavior, exact indicator alignment, mobile overflow, and automated WCAG A/AA checks.
- The in-app Browser could inspect the local entry screen but cannot reach the connected result because it has no injected wallet. The connected-state visual was therefore captured by the repository's mocked-wallet browser regression.

## Comparison evidence

- Full view: both source and implementation preserve the four-card provider grid followed by a separate, full-width OWN comparison row.
- Focused row: the implementation removes the left-edge drift visible in the source and aligns the OWN circle with the card radios. The hover tint spans the entire row, making the enlarged hit area visible without turning it into a promotional CTA.
- A separate crop was unnecessary because the implementation capture keeps the full OWN row and its controls legible at native density.

## Comparison history

- Initial P2: only the left identity cluster was clickable, and the OWN radio began 16 px left of the provider-card radios.
- Fix: wrapped all three row columns in one full-width button and applied the same 16 px horizontal inset used inside provider cards.
- Post-fix evidence: `/private/tmp/powerrr-own-row-implementation.png`; automated geometry differs by no more than 1 CSS px, and clicking the rightmost content selects OWN.

## Follow-up polish

- No P3 follow-up is required for this scoped change.

final result: passed

---

# Guided Path expanded prototype design QA

## Comparison target

- Source visual truth: `/Users/vojtch/code/powerrr/design-audit/guided-path/reference-guided-path.jpg`.
- Browser-rendered implementation: `/Users/vojtch/code/powerrr/design-audit/guided-path/implementation-start.jpg`.
- Additional implementation states: `/Users/vojtch/code/powerrr/design-audit/guided-path/implementation-review.jpg`, `/Users/vojtch/code/powerrr/design-audit/guided-path/implementation-detail.jpg`, `/Users/vojtch/code/powerrr/design-audit/guided-path/final-mobile-start.jpg`, and `/Users/vojtch/code/powerrr/design-audit/guided-path/final-mobile-review.jpg`.
- Focused comparison crops: `/Users/vojtch/code/powerrr/design-audit/guided-path/reference-focus.jpg` and `/Users/vojtch/code/powerrr/design-audit/guided-path/implementation-focus.jpg`.
- Source pixels: 1440 × 1033. Implementation start pixels: 1440 × 1323. Both were captured from a 1440 × 1000 CSS px browser viewport at device scale factor 1; the different full-page heights reflect the intentionally expanded goal content below the shared shell.
- Mobile viewport: 390 × 844 CSS px at device scale factor 1.
- State: light theme, static demo wallet `powerrr.eth`, $55,000 request, all five collateral assets, default “More buffer” and “Comfortable buffer” preferences.

## Findings

- No actionable P0, P1, or P2 fidelity issue remains.
- Fonts and typography preserve the selected prototype’s Inter/system family, display scale, heavy optical weight, compact tracking, body sizing, and hierarchy. The wider review/detail states do not change the default hero wrapping.
- Spacing and layout rhythm preserve the 960 px default Guided Path frame, panel radius, hairline borders, restrained surface treatment, and generous page rhythm. The review and detail states intentionally expand to 1080 px to keep normalized route evidence readable.
- Colors and visual tokens continue to use the source paper, surface, mist, river, ink, slate, success, warning, and line colors. New risk and validation states use semantic tints without introducing a new visual system.
- Image quality and asset fidelity are preserved. Existing raster token assets and the official OWN logo are reused at native proportions; no placeholder imagery, custom SVG substitution, emoji, or CSS illustration was introduced.
- Copy and content now stand alone through the full decision: amount, purpose, timing, preference, collateral, recommendation rationale, alternatives, unavailable-route explanation, detailed terms, and point-in-time estimate disclosure.
- The expanded states use semantic buttons, fieldsets, labels, a native select, status/alert messaging, visible focus outlines, practical tap targets, and reduced-motion support. Screenshot evidence does not prove full assistive-technology compatibility, but DOM inspection confirmed labeled controls and ordered headings.

## Full-view comparison evidence

- The source and implementation were opened together in the same comparison input at the same 1440 px width and default Guided Path state.
- Header, UX Lab navigation, selected tab treatment, hero hierarchy, typography, palette, progress treatment, and panel placement remain visually aligned.
- The implementation adds explicit step labels and more content below the first amount decision. Those are intentional product extensions requested for deeper review, not unintentional style drift.
- Review and detail captures show the same visual language extended into recommendation rationale, route ranking, normalized metrics, assumptions, and next-step controls.

## Focused comparison evidence

- The 960 × 533 focused crops compare the hero-to-progress-to-panel transition. The same left alignment, progress thickness, river color, panel radius, and border weight remain intact.
- The implementation’s explicit `1 · Goal`, `2 · Preferences`, and `3 · Review` labels add orientation between the progress bar and panel; their small slate treatment keeps them subordinate to the task heading.

## Primary interactions tested

- Amount presets and manual amount entry.
- Over-capacity error and disabled continuation at $120,000.
- Loan purpose and timing selection.
- Priority and risk-comfort selection.
- Collateral inclusion/exclusion with capacity recalculation.
- Recommendation generation and ranking changes.
- Matching and unavailable route details.
- Review-to-detail and detail-to-comparison navigation.
- Desktop and 390 px mobile flow transitions.
- Production static generation and generated artifact syntax.
- Browser console warnings/errors: none.

## Comparison history

- P2: On mobile, the wallet summary appeared before the current decision, delaying the primary task. Fix: removed the mobile sidebar reordering so the active step remains first. Post-fix evidence: `final-mobile-start.jpg`; the goal content precedes the wallet summary and page width remains 390 px.
- P2: Step changes initially preserved a deep scroll position and could land the user inside the alternatives list. Fix: added a post-render flow-position reset after next, back, detail-open, and detail-close actions. Post-fix evidence: the active step main content begins at approximately 55 CSS px below the sticky navigation at 390 px.
- P2: Expanding the whole Guided Path frame to 1080 px changed the selected prototype’s default hero wrapping. Fix: restored the default 960 px frame and expands only recommendation/detail states. Post-fix evidence: `implementation-start.jpg` matches the source hero width and default panel width at 960 CSS px.
- P2: An unavailable Morpho route initially reused positive “fits your brief” language. Fix: added a shortfall-specific explanation, removed the continue action, and labels the rate illustration against the route maximum. Post-fix DOM evidence shows the $8,734 shortfall and only “Back to matching routes.”

## Follow-up polish

- P3: In a later implementation pass, consider testing whether the persistent UX Lab concept navigation should be hidden inside the production version; it remains useful for this experimental review environment.

final result: passed
