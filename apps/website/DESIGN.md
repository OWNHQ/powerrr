---
name: Powerrr
description: "A calm, exact, protective interface for private Ethereum borrowing comparisons."
colors:
  ink: "#1d1b19"
  paper: "#f3eee5"
  surface: "#fffcf7"
  mist: "#ebe3d8"
  line: "#9b8d7e"
  slate: "#5f574f"
  moss: "#3e6a4e"
  river: "#9f3f33"
  own: "#9f3f33"
  own-soft: "#f2dfda"
  coral: "#ad4738"
  gold: "#8b641c"
  accent-contrast: "#ffffff"
  warning-text: "#704c0d"
  warning-surface: "#fff4d6"
  warning-border: "#dbc072"
  info-text: "#31596a"
  info-surface: "#e9f1f0"
  danger-text: "#9f3f33"
  danger-surface: "#f9e7e3"
typography:
  display:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 650
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  display-wide:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "5rem"
    fontWeight: 650
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 650
    lineHeight: "2rem"
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 650
    lineHeight: "1.75rem"
    letterSpacing: "-0.02em"
  subtitle:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 650
    lineHeight: "1.5rem"
    letterSpacing: "-0.0125em"
  body:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 420
    lineHeight: "1.75rem"
  body-small:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  label:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 650
    lineHeight: "1rem"
    letterSpacing: "0.08em"
rounded:
  compact: "6px"
  control: "8px"
  panel: "12px"
  feature: "16px"
  full: "9999px"
spacing:
  hairline: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.river}"
    textColor: "{colors.accent-contrast}"
    typography: "{typography.body-small}"
    rounded: "{rounded.control}"
    padding: "12px 24px"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.river}"
    typography: "{typography.body-small}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "44px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "20px 24px"
  feature-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.feature}"
    padding: "20px 24px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-small}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "44px"
  status-chip:
    backgroundColor: "{colors.warning-surface}"
    textColor: "{colors.warning-text}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
---

# Design System: Powerrr

## Overview

**Creative North Star: "The Private Instrument Panel"**

Powerrr should feel like a private analytical instrument: calm enough to reduce financial anxiety, exact enough to earn scrutiny, and protective enough to make constraints and uncertainty visible before action. The interface favors quiet evidence over spectacle. It presents complex onchain information in a sequence of bounded, readable decisions rather than recreating the density or urgency of a trading terminal.

The visual system is restrained, tactile, and evidence-first. Limestone Paper gives the product a warm, low-noise working field; Mineral Red marks action, selection, focus, and trusted orientation. Near-black ink and warm graphite outlines bring the precision of a printed instrument docket without copying another protocol's cream-and-coral identity. Standard panels stay flat and outlined; only truly floating help or menu surfaces receive ambient lift.

**Key Characteristics:**

- Warm mineral neutrals with one disciplined red-clay primary accent.
- Clear outlined panels, gentle paper-toned grouping, and shadow only for floating surfaces.
- Compact evidence grids that preserve readable labels and tabular values.
- Rounded, tactile controls with visible keyboard focus and honest state language.
- One deliberate light theme that remains stable regardless of system preference.

## Colors

The palette combines Mineral Red and Limestone Paper with warm near-black and umber neutrals. Moss, terracotta, ochre, and paired semantic surfaces communicate state; they do not decorate neutral content.

### Primary

- **Mineral Red** (`river`): primary actions, selected states, progress, links, focus indicators, and trusted orientation. It is deeper and earthier than the bright coral in the reference source. OWN shares this hue so its path remains a peer rather than a visually privileged destination.
- **High-contrast accent ink** (`accent-contrast`): content placed on solid Mineral Red.

### Secondary

- **Protective Moss** (`moss`): successful reads, available capacity, and positive system state.
- **Alert Terracotta** (`coral`): errors, thin safety margins, and threshold danger.
- **Caution Ochre** (`gold`): cautionary emphasis that needs more presence than neutral text but less urgency than terracotta.

### Tertiary

- **Warning pair** (`warning-text`, `warning-surface`, `warning-border`): recoverable problems, stale data, unavailable sources, and explicit caution.
- **Information pair** (`info-text`, `info-surface`): selected or active informational surfaces that need a cool counterpoint to the warm paper field.
- **Danger pair** (`danger-text`, `danger-surface`): actionable failures and blocking errors.

### Neutral

- **Limestone Paper** (`paper`): the single light page canvas and focus-ring offset.
- **Porcelain Surface** (`surface`): panels, menus, controls, and floating content.
- **Parchment Mist** (`mist`): subordinate evidence cells, selected supporting regions, and gentle sectional grouping.
- **Warm Graphite** (`line`): borders, dividers, and structural outlines.
- **Measured Umber** (`slate`): secondary copy, labels, help text, and metadata.
- **Near-black Ink** (`ink`): headings, essential values, and primary content.

**The One Mineral Signal Rule.** Mineral Red is the only general-purpose interactive accent. Do not introduce protocol-by-protocol brand colors into the comparison hierarchy.

**The Semantic Restraint Rule.** Moss, coral, gold, information blue, and warning amber carry meaning only. Never scatter them through neutral evidence for visual variety.

**The Health Factor Signal.** Always pair color with the numeric health factor and a plain-language buffer label: moss at 1.60 and above, ochre from 1.20 to 1.59, and terracotta below 1.20. A value at or below 1.00 is at or beyond the liquidation boundary. These are transparent proximity bands, never a recommendation or probability.

**The Daylight Instrument Rule.** The palette is deliberately light-only and ignores operating-system dark preference. Do not auto-invert it or quietly restore a second theme.

## Typography

**Display Font:** Self-hosted Inter Variable with the system sans-serif fallback stack.

**Body Font:** Self-hosted Inter Variable with the system sans-serif fallback stack.

**Character:** One pragmatic sans-serif family keeps the interface neutral and computational. The app ships one variable weight asset with `font-display: swap`; it does not request a separate italic or second family. Hierarchy comes from size, weight, spacing, and tabular lining figures rather than from decorative type pairing.

### Hierarchy

- **Display** (650, fluid 2.75rem–5rem, 0.98 line-height, -0.035em): the pre-connect product promise only, constrained to 11 characters per line.
- **Headline** (650, 1.5rem, 2rem line-height, -0.025em): result identity and major state headings.
- **Title** (650, 1.25rem, 1.75rem line-height, -0.02em): workflow panels and local task sections.
- **Subtitle** (650, 1.125rem, 1.5rem line-height, -0.0125em): provider identity and compact subsection headings.
- **Body** (420, 1rem, 1.75rem line-height): explanatory product copy, generally constrained to readable measures around 36rem to 48rem.
- **Body Small** (400–600, 0.875rem, 1.5rem line-height): controls, evidence descriptions, and most operational copy.
- **Label** (650, 0.75rem, 1rem line-height, 0.08em tracking, uppercase when it establishes a step or category): short orientation labels only.

Numeric estimates, amounts, ratios, block numbers, and counts use tabular figures. Tracked uppercase labels stay short; paragraphs remain sentence case.

**The Instrument Readout Rule.** Financial values align with tabular figures and never compete with their explanatory labels through unnecessary color or weight.

**The One Display Moment Rule.** Large tight display type belongs to the pre-connect promise. Operational screens return immediately to compact task hierarchy.

## Layout

The application uses a centered working canvas with a maximum width of 1360px and page gutters of 16px, expanding to 24px and 32px at larger breakpoints. The pre-connect state narrows to a 1152px region with copy constrained around 576px so the wallet action remains the only decision. A sticky 64px header preserves identity and wallet state without becoming a navigation system.

The collateral stage becomes a selection workspace from 1024px upward: the asset field occupies the flexible primary column while a 288–320px summary rail stays within reach at the right edge. The rail carries the selected count, priced value, privacy context, and the Compare action; it does not duplicate asset evidence. Below 1024px the same DOM order stacks the summary after the asset field, preserving a linear choose-then-continue path for touch and assistive technology.

The comparison stage becomes a workbench from 1280px upward: a 320px request controller stays sticky in the left column while the provider evidence field receives the wider right column. Amount and range controls stack inside the rail, keeping the request visible while expanded provider evidence grows vertically. Below 1280px, the controller returns to a full-width horizontal composition where space permits and remains ahead of providers in both visual and DOM order.

Spacing follows an 8px-led rhythm with useful intermediate 12px and 20px steps. Major panels usually use 20–24px internal padding; dense evidence cells use 12px; adjacent workflow sections use 12–20px gaps. The layout is information-dense but never compressed below reliable touch or reading sizes.

At 640px, repeated evidence grids move from two columns toward three or five columns and supporting step descriptions become visible. At 1024px, summary regions can become horizontal and detailed evidence can reach six columns. Mobile preserves the same reading order by stacking; it does not hide unavailable, unsupported, or risk evidence. Interactive targets remain at least 44px high.

**The One Decision Per Region Rule.** Each bounded region should make one task legible: choose collateral, set an amount, compare paths, or inspect evidence.

**The Stack Before Squeeze Rule.** When content no longer fits, stack or reduce columns before shrinking text, targets, or explanatory labels.

## Elevation & Depth

Powerrr is flat by default. Warm Graphite outlines and paper-toned contrast establish structure; shadows provide gentle separation only for floating menus, help surfaces, and the range thumb. Standard panels, summaries, and protocol rows remain outlined without shadow.

### Shadow Vocabulary

- **Floating ambient** (`0 12px 34px rgb(68 45 32 / 0.12)`): menus and help surfaces that genuinely sit above the working plane.
- **Control contact** (`0 2px 7px rgb(var(--color-overlay) / 0.22)`): the amount slider thumb and similarly tactile, draggable controls.

**The Border First Rule.** A border or tonal change must explain the structure before a shadow is added.

**The Ambient, Not Floating Rule.** Shadows are diffuse and low-drama. Do not use hard drop shadows, colored glows, glassmorphism, or stacked elevation for ordinary content.

## Motion

Motion explains progress and spatial relationship. The primary sequence is the **instrument aperture**: the landing surface closes toward the wallet action, the scan dial occupies that same focal center while reads are active, and the completed workspace opens back onto the working plane. It uses a bounded clip, slight focus change, and opacity over 320–460ms with confident exponential deceleration.

Moving between collateral and comparison uses a quiet paper handoff: a 90ms exit followed by a 160ms arrival with only a two-pixel vertical settle and modest opacity change. It deliberately avoids directional travel, clipping, and blur so routine navigation stays subordinate to the wallet-read aperture. Wallet identity changes use a compact 220ms horizontal aperture, scan messages change in 160ms, and the progress fill moves by transform over 360ms. The scan dial is the only loop and exists only while a real wallet read is active.

Provider details unfold from the persistent action rail by opening their content track over 240ms with confident deceleration; closing resolves in 160ms. This disclosure motion explains where the evidence belongs without animating individual metrics or asset rows.

**The Motion Carries State Rule.** Animate only wallet state, active scanning, the quiet workflow handoff, and explicit provider disclosure. Static evidence and repeated provider rows do not receive decorative entrances.

**The Immediate Alternative Rule.** Under `prefers-reduced-motion: reduce`, scrolling, transitions, and the scan dial resolve nearly instantly without hiding any content or state.

## Shapes

The form language is gently rounded and practical. Compact brand focus treatments use 6px corners; controls use 8px; repeated panels and comparison rows use 12px; the result summary uses 16px. Circular geometry is reserved for token icons, selection indicators, progress numbers, status dots, and range thumbs. Borders are consistently one pixel and use Warm Graphite unless a semantic state requires its paired color.

Clipping belongs to real containers with bounded children, such as expandable protocol rows and panels. Rounded rectangles should communicate touchability or grouping, not decorate every text block.

**The Radius Ladder Rule.** Use 8px for controls, 12px for standard panels, and 16px only for a genuinely higher-order summary or feature region.

**The Circle Means Marker Rule.** Full circles indicate an asset, step, selection, status, or draggable point—not a generic container.

## Components

Components feel restrained, tactile, and evidence-first. State changes use short standard transitions, visible borders, tonal fills, and semantic copy; motion never replaces evidence.

### Buttons

- **Shape:** gently rounded controls (8px) with a minimum height of 44px; primary workflow actions use 48px.
- **Primary:** solid Mineral Red, high-contrast accent ink, semibold 0.875rem text, and 24px horizontal padding.
- **Hover / Focus:** hover slightly reduces primary opacity; keyboard focus uses a 2px Mineral Red ring with a 2px Limestone Paper offset.
- **Secondary:** Porcelain Surface or transparent background, Warm Graphite border, Mineral Red text, and a red-clay border shift on hover.
- **Low emphasis:** text-led buttons may gain an Information Surface hover fill but retain a real 40–44px target.
- **Disabled:** preserve the component shape while reducing opacity; unavailable choices also explain why they are unavailable.

### Chips

- **Style:** full pill geometry, compact 4px by 10px padding, 0.75rem semibold text, and a semantic text/surface pairing.
- **State:** chips annotate example data or status. They are not primary actions and do not carry unlabeled color-only meaning.

### Cards / Containers

- **Corner Style:** 12px for standard panels and rows; 16px for the result summary.
- **Background:** Porcelain Surface for the container, Parchment Mist at partial opacity for subordinate evidence cells, and Information Surface for selected orientation.
- **Shadow Strategy:** standard panels and comparison rows are flat; only floating utility surfaces receive ambient shadow.
- **Border:** one-pixel Warm Graphite, shifting to Mineral Red for selected or focused state.
- **Internal Padding:** 20–24px for panels, 16–20px for rows, and 12px for compact evidence cells.

### Inputs / Fields

- **Style:** Porcelain Surface, one-pixel Warm Graphite, 8px corners, and at least 44px height. The amount field may use 1.875rem numerals because it is the primary adjustable value.
- **Focus:** border shifts to Mineral Red with a one-pixel reinforcing ring; global focus treatment remains visible outside the component.
- **Error / Disabled:** Alert Coral or the danger pair accompanies explicit corrective text. Disabled state never relies on opacity alone when the reason matters.
- **Range:** an 8px track shows completed Mineral Red against Warm Graphite, with a 28px Porcelain Surface thumb outlined in red clay and given a small contact shadow.

On the comparison workbench, the amount field and range form one sticky request controller at wide widths. The controller never competes with provider evidence for horizontal space before 1280px; at intermediate widths its internal field and range may sit side by side, while at wide and phone widths they stack.

### Navigation

- **Header:** a sticky 64px Porcelain Surface layer with a restrained bottom border and slight backdrop blur. It contains only product identity and wallet state.
- **Workflow steps:** two equal compact panels with circular numbers. Active and complete steps use Mineral Red; the active step also uses Information Surface. Supporting labels appear from 640px upward.
- **Mobile:** preserve both steps and their order; shorten supporting detail before removing the step itself.

### Selection Cards

Asset choices are 12px-radius bordered buttons with a minimum height around 128px. Selection uses a Mineral Red border, a one-pixel reinforcing ring, Information Surface, and a checked circular marker. Token imagery stays at 44px and secondary valuation or provenance copy remains visible.

At wide widths, asset choices sit in the primary workspace beside a sticky selection summary rather than sharing one long panel with the final action. Two columns protect intermediate widths; a third appears only when the primary field has enough room after the rail. Collapsible small and unpriced groups keep the same column behavior.

### Protocol Comparison Rows

Protocol and OWN paths share the same expandable 12px-radius bordered-row structure. The collapsed view leads with provider identity and availability, followed by a consistent evidence grid and a restrained persistent action rail. The action remains in that rail when details open, ahead of constraints and the asset list, so it never moves below a long disclosure. Expansion reveals constraints, asset eligibility, and source detail. OWN may state its distinct fixed-term mechanism, but it must not gain stronger elevation, scale, saturation, or placement than peer paths.

**The Equal Evidence Rule.** Comparison paths share one structural grammar even when their mechanisms differ.

**The State Plus Reason Rule.** Every unavailable, unsupported, stale, risky, or disabled state pairs a visual treatment with human-readable evidence.

## Do's and Don'ts

### Do:

- **Do** use Mineral Red sparingly for action, selection, progress, focus, and trusted orientation.
- **Do** let Warm Graphite borders and Parchment Mist organize dense evidence before adding elevation.
- **Do** keep operational copy direct, measured, and visibly attached to the value or state it explains.
- **Do** preserve tabular figures, readable labels, and the same evidence order across responsive layouts.
- **Do** keep the single light palette stable even when the operating system requests dark mode.
- **Do** give OWN the same comparison structure and visual weight as pooled protocols.

### Don't:

- **Don't** introduce neon crypto palettes, protocol-brand rainbows, speculative gradients, or trading-terminal glow.
- **Don't** use glassmorphism, hard shadows, floating card stacks, or decorative elevation for repeated evidence.
- **Don't** turn OWN into a banner, hero, special offer, or visually dominant sales path.
- **Don't** hide unsupported assets, unavailable providers, risk evidence, or explanatory labels to make the interface feel cleaner.
- **Don't** shrink essential operational text below 0.75rem or interactive targets below 44px.
- **Don't** use color alone to communicate availability, selection, risk, or error.
