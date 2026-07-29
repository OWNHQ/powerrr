const assets = [
  { id: "weth", name: "WETH", value: 63510, image: "/tokens/weth.png" },
  { id: "usdc", name: "USDC", value: 42000, image: "/tokens/usdc.png" },
  { id: "wbtc", name: "WBTC", value: 41230, image: "/tokens/wbtc.png" },
  { id: "wsteth", name: "wstETH", value: 30150, image: "/tokens/wsteth.png" },
  { id: "dai", name: "DAI", value: 9500, image: "/tokens/dai.png" },
];

const protocols = [
  {
    id: "own",
    name: "OWN",
    capacity: 101118,
    apr: 9.5,
    rate: "Fixed",
    confidence: "Reviewed",
    liquidation: "No automatic liquidation",
    term: "24 months",
    reason:
      "Predictable repayment and no automatic price-triggered liquidation.",
  },
  {
    id: "aave",
    name: "Aave",
    capacity: 110997,
    apr: 6.1,
    rate: "Variable",
    confidence: "High",
    liquidation: "63% collateral decline",
    term: "Open-ended",
    reason: "Highest immediate capacity with strong quote confidence.",
  },
  {
    id: "spark",
    name: "Spark",
    capacity: 86457,
    apr: 5.2,
    rate: "Variable",
    confidence: "High",
    liquidation: "59% collateral decline",
    term: "Open-ended",
    reason: "Lower rate while keeping a comfortable capacity buffer.",
  },
  {
    id: "compound",
    name: "Compound",
    capacity: 70515,
    apr: 5.7,
    rate: "Variable",
    confidence: "High",
    liquidation: "45% collateral decline",
    term: "Open-ended",
    reason: "Simple pooled structure with enough capacity for this request.",
  },
  {
    id: "morpho",
    name: "Morpho",
    capacity: 46266,
    apr: 4.8,
    rate: "Variable",
    confidence: "Medium",
    liquidation: "Request exceeds capacity",
    term: "Open-ended",
    reason:
      "Lowest displayed rate, but this market cannot cover the full request.",
  },
];

const conceptCopy = {
  guided: {
    eyebrow: "Direction 1 · Progressive disclosure",
    title: "One decision at a time.",
    lede: "Start with the borrowing goal, reveal only the information needed now, and end with a clear recommendation plus alternatives.",
    hypothesis:
      "Best for newer borrowers who want confidence without learning every protocol first.",
  },
  shortlist: {
    eyebrow: "Direction 2 · Decision-first ranking",
    title: "Set the goal. See the shortlist.",
    lede: "Keep the user’s amount and priority fixed on the left while every borrowing route explains why it does—or does not—fit.",
    hypothesis:
      "Best for people who know roughly what they need and want a fast, defensible choice.",
  },
  workbench: {
    eyebrow: "Direction 3 · Expert comparison",
    title: "A loan workbench for power users.",
    lede: "Put collateral selection, normalized provider metrics, and route detail in one dense desktop workspace.",
    hypothesis:
      "Best for DeFi-native users who value control, scan speed, and direct comparison over guidance.",
  },
  risk: {
    eyebrow: "Direction 4 · Safety-first exploration",
    title: "Choose the risk before the provider.",
    lede: "Make the amount-to-buffer relationship the hero interaction, then let the user compare how providers change the outcome.",
    hypothesis:
      "Best when the product wants to lead with responsible borrowing and make liquidation risk tangible.",
  },
  concierge: {
    eyebrow: "Direction 5 · Goal-based conversation",
    title: "A calm borrowing guide.",
    lede: "Replace the dashboard with a short, human question flow that builds a recommendation and records the reasoning as it goes.",
    hypothesis:
      "Best for cautious or infrequent borrowers who are more comfortable answering questions than configuring a tool.",
  },
};

const state = {
  concept: getConcept(),
  amount: 55000,
  priority: "safety",
  guidedStep: 1,
  guidedDetail: null,
  loanPurpose: "Cash buffer",
  loanTiming: "Within 30 days",
  riskComfort: "comfortable",
  selectedAssets: new Set(assets.map((asset) => asset.id)),
  workbenchProtocol: "aave",
  riskProtocol: "aave",
  riskAmount: 55000,
  conversationStep: 0,
  conversation: [],
  guidePreferences: {
    goal: "Not answered",
    risk: "Not answered",
    amount: "Not answered",
  },
};

const prototype = document.querySelector("#prototype");
const toast = document.querySelector("#toast");
let toastTimer;

function getConcept() {
  const value = new URLSearchParams(window.location.search).get("concept");
  return Object.hasOwn(conceptCopy, value) ? value : "guided";
}

function usd(value, compact = false) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: compact ? "compact" : "standard",
  }).format(value);
}

function clampAmount(value) {
  return Math.max(1000, Math.min(120000, Number(value) || 1000));
}

function protocolMark(protocol) {
  if (protocol.id === "own") {
    return `<div class="protocol-mark"><img class="own-mark" src="/brands/own.svg" alt="OWN" /><strong>OWN</strong></div>`;
  }
  return `<div class="protocol-mark"><strong>${protocol.name}</strong></div>`;
}

function assetChips() {
  return `<div class="asset-row">${assets
    .map(
      (asset) =>
        `<span class="asset-chip"><img src="${asset.image}" alt="" />${asset.name} <span>${usd(asset.value, true)}</span></span>`,
    )
    .join("")}</div>`;
}

function intro(concept) {
  const copy = conceptCopy[concept];
  return `<section class="concept-intro">
    <div>
      <p class="eyebrow">${copy.eyebrow}</p>
      <h1>${copy.title}</h1>
      <p class="lede">${copy.lede}</p>
    </div>
    <aside class="hypothesis"><strong>Hypothesis</strong>${copy.hypothesis}</aside>
  </section>`;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3200);
}

function scrollToGuidedFlow() {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const progress = document.querySelector(".guided-progress");
      if (!progress) return;
      const top = progress.getBoundingClientRect().top + window.scrollY - 72;
      window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
    });
  });
}

function chooseRecommended(priority, amount = state.amount) {
  const available = protocols.filter(
    (protocol) => adjustedCapacity(protocol) >= amount,
  );
  if (!available.length) return protocols[0];
  if (priority === "predictability") {
    return available.find((protocol) => protocol.id === "own") || available[0];
  }
  if (priority === "cost") {
    return [...available].sort((a, b) => a.apr - b.apr)[0];
  }
  if (state.riskComfort === "maximum") {
    return [...available].sort(
      (a, b) => adjustedCapacity(a) - adjustedCapacity(b),
    )[0];
  }
  if (state.riskComfort === "balanced") {
    const balanced = available.filter(
      (protocol) => amount / adjustedCapacity(protocol) <= 0.8,
    );
    if (balanced.length) return [...balanced].sort((a, b) => a.apr - b.apr)[0];
  }
  return [...available].sort((a, b) => {
    const ownBonusA = a.id === "own" ? 0.12 : 0;
    const ownBonusB = b.id === "own" ? 0.12 : 0;
    return (
      adjustedCapacity(b) / amount +
      ownBonusB -
      (adjustedCapacity(a) / amount + ownBonusA)
    );
  })[0];
}

function guidedPriorityLabel() {
  if (state.priority === "cost") return "Lower rate";
  if (state.priority === "predictability") return "Predictable terms";
  return "More buffer";
}

function guidedRiskLabel() {
  if (state.riskComfort === "balanced") return "Balanced";
  if (state.riskComfort === "maximum") return "Higher utilization";
  return "Comfortable buffer";
}

function guidedRouteStatus(protocol) {
  const capacity = adjustedCapacity(protocol);
  if (capacity < state.amount)
    return { label: "Doesn’t cover request", tone: "watch" };
  const usage = state.amount / capacity;
  if (usage <= 0.55) return { label: "Comfortable buffer", tone: "" };
  if (usage <= 0.8) return { label: "Moderate buffer", tone: "watch" };
  return { label: "Near capacity", tone: "watch" };
}

function renderGuidedDetail(protocol) {
  const capacity = adjustedCapacity(protocol);
  const fits = capacity >= state.amount;
  const remaining = Math.max(0, capacity - state.amount);
  const oneYearInterest =
    (Math.min(state.amount, capacity) * protocol.apr) / 100;
  const pooled = protocol.id !== "own";
  return `<button class="guided-back-link" data-guided-close-detail>Back to recommendation</button>
    <p class="eyebrow">Route review</p>
    <div class="guided-detail-head">
      <div>${protocolMark(protocol)}<h2>${protocol.name} at ${usd(state.amount)}</h2><p class="muted">${protocol.reason}</p></div>
      <span class="confidence">${protocol.confidence} confidence</span>
    </div>
    <div class="stat-grid guided-detail-stats">
      <div class="stat"><span>Displayed APR</span><strong>${protocol.apr}% ${protocol.rate.toLowerCase()}</strong></div>
      <div class="stat"><span>Estimated capacity</span><strong>${usd(capacity)}</strong></div>
      <div class="stat"><span>Capacity left</span><strong>${usd(remaining)}</strong></div>
    </div>
    <section class="guided-detail-section">
      <p class="eyebrow">How this route works</p>
      <h3>${pooled ? "Open-ended pooled borrowing" : "Reviewed fixed-term borrowing"}</h3>
      <p class="muted">${pooled ? `Supply selected collateral to ${protocol.name}, borrow USDC against it, and monitor a variable rate and liquidation threshold over time.` : "Submit a reviewed request with an agreed amount, rate, maturity date, and repayment schedule. Approval and final terms are not automatic."}</p>
      <div class="guided-facts">
        <div><span>Rate structure</span><strong>${protocol.rate}</strong></div>
        <div><span>Term</span><strong>${protocol.term}</strong></div>
        <div><span>Primary risk</span><strong>${protocol.liquidation}</strong></div>
        <div><span>${fits ? "Illustrative 12-month interest" : "At route maximum (12 mo.)"}</span><strong>${usd(oneYearInterest)}</strong></div>
      </div>
    </section>
    <section class="guided-detail-section">
      <p class="eyebrow">${fits ? "Why it fits your brief" : "Why it doesn’t fit yet"}</p>
      <ul class="reason-list">${fits ? `<li>Covers the full ${usd(state.amount)} request using ${state.selectedAssets.size} selected collateral assets.</li><li>Supports your “${guidedPriorityLabel().toLowerCase()}” preference.</li><li>${pooled ? `${Math.round((state.amount / capacity) * 100)}% of estimated capacity would be used at entry.` : "Terms are reviewed before any agreement is made."}</li>` : `<li>The estimated maximum is ${usd(capacity)}, leaving a ${usd(state.amount - capacity)} shortfall.</li><li>The displayed rate is not meaningful for the full request because this route cannot supply the amount.</li><li>Lower the request, include more eligible collateral, or compare another route.</li>`}</ul>
    </section>
    <section class="guided-disclosure"><h3>Before continuing</h3><p>This is a static, point-in-time estimate—not an offer. Rates, prices, liquidity, protocol parameters, and final eligibility can change. No transaction has been prepared or signed.</p></section>
    <div class="button-row guided-detail-actions">${fits ? `<button class="button-primary" data-toast="${pooled ? `${protocol.name} would open with your route summary. No wallet action is performed in this prototype.` : "The OWN request preview would open next. Nothing is submitted in this prototype."}">${pooled ? `Continue to ${protocol.name}` : "Preview OWN request"}</button>` : ""}<button class="button-secondary" data-guided-close-detail>${fits ? "Compare another route" : "Back to matching routes"}</button></div>`;
}

function renderGuided() {
  const step = state.guidedStep;
  const recommendation = chooseRecommended(state.priority);
  const totalCollateral = selectedCollateralValue();
  const maximumCapacity = Math.max(
    ...protocols.map((protocol) => adjustedCapacity(protocol)),
  );
  const matchingRoutes = protocols.filter(
    (protocol) => adjustedCapacity(protocol) >= state.amount,
  );
  const amountFits = matchingRoutes.length > 0;
  let content = "";

  if (state.guidedDetail) {
    const detailProtocol =
      protocols.find((protocol) => protocol.id === state.guidedDetail) ||
      recommendation;
    content = renderGuidedDetail(detailProtocol);
  } else if (step === 1) {
    content = `<p class="eyebrow">Your goal</p>
      <h2>How much liquidity do you want?</h2>
      <p class="muted">Start with the outcome. We’ll only show paths that can cover the full request.</p>
      <label class="field-label" for="guided-amount">Borrow amount in USDC</label>
      <div class="amount-field"><span>$</span><input id="guided-amount" inputmode="numeric" value="${state.amount}" aria-describedby="guided-capacity" /></div>
      <p id="guided-capacity" class="muted">Your selected assets currently support up to ${usd(maximumCapacity)}.</p>
      <div class="choice-grid" aria-label="Quick amounts">${[25000, 55000, 85000].map((amount) => `<button class="choice" data-guided-amount="${amount}" aria-pressed="${state.amount === amount}"><strong>${usd(amount)}</strong><small>${Math.round((amount / maximumCapacity) * 100)}% of max</small></button>`).join("")}</div>
      <fieldset class="guided-fieldset"><legend>What is the liquidity for?</legend><div class="choice-grid">${[
        ["Cash buffer", "Keep flexibility"],
        ["Business or investment", "Fund an opportunity"],
        ["Major purchase", "Plan a known expense"],
      ]
        .map(
          ([label, description]) =>
            `<button type="button" class="choice" data-guided-purpose="${label}" aria-pressed="${state.loanPurpose === label}"><strong>${label}</strong><small>${description}</small></button>`,
        )
        .join("")}</div></fieldset>
      <label class="field-label guided-timing-label" for="guided-timing">When would you need the funds?</label>
      <select class="field-control guided-select" id="guided-timing"><option ${state.loanTiming === "Within 30 days" ? "selected" : ""}>Within 30 days</option><option ${state.loanTiming === "In 1–3 months" ? "selected" : ""}>In 1–3 months</option><option ${state.loanTiming === "I’m only exploring" ? "selected" : ""}>I’m only exploring</option></select>
      ${!amountFits ? `<p class="guided-error" role="alert">This request is above the current estimated maximum of ${usd(maximumCapacity)}. Lower the amount to continue.</p>` : ""}
      <div class="button-row" style="margin-top:24px"><button class="button-primary" data-guided-next ${amountFits ? "" : "disabled"}>Continue to preferences</button></div>`;
  } else if (step === 2) {
    content = `<p class="eyebrow">What matters most</p>
      <h2>How should we shape the recommendation?</h2>
      <p class="muted">These preferences change the ranking, not the underlying estimate.</p>
      <h3>Choose the primary priority</h3>
      <div class="choice-grid">${[
        ["safety", "More buffer", "More room for market movement"],
        ["cost", "Lower rate", "Minimize today’s displayed APR"],
        ["predictability", "Predictable terms", "Fixed rate and maturity date"],
      ]
        .map(
          ([id, label, description]) =>
            `<button class="choice" data-priority="${id}" aria-pressed="${state.priority === id}"><strong>${label}</strong><small>${description}</small></button>`,
        )
        .join("")}</div>
      <fieldset class="guided-fieldset"><legend>How much buffer feels right?</legend><div class="choice-grid">${[
        ["comfortable", "Comfortable", "Prioritize room for price movement"],
        ["balanced", "Balanced", "Trade some buffer for access"],
        ["maximum", "Higher utilization", "Use more of the available capacity"],
      ]
        .map(
          ([id, label, description]) =>
            `<button type="button" class="choice" data-guided-risk="${id}" aria-pressed="${state.riskComfort === id}"><strong>${label}</strong><small>${description}</small></button>`,
        )
        .join("")}</div></fieldset>
      <div class="guided-collateral-head"><div><h3>Collateral included</h3><p class="muted">${state.selectedAssets.size} of ${assets.length} assets · ${usd(totalCollateral)} selected</p></div><span class="pill neutral">EDITABLE</span></div>
      <div class="guided-asset-list">${assets.map((asset) => `<button class="guided-asset" data-guided-asset="${asset.id}" aria-pressed="${state.selectedAssets.has(asset.id)}"><img src="${asset.image}" alt="" /><span><strong>${asset.name}</strong><small>${usd(asset.value)}</small></span><small>${state.selectedAssets.has(asset.id) ? "Included" : "Excluded"}</small></button>`).join("")}</div>
      <div class="guided-fit-summary"><strong>${matchingRoutes.length} route${matchingRoutes.length === 1 ? "" : "s"} cover ${usd(state.amount)}</strong><span>Estimated maximum: ${usd(maximumCapacity)}</span></div>
      <div class="button-row" style="margin-top:28px"><button class="button-secondary" data-guided-back>Back</button><button class="button-primary" data-guided-next ${amountFits ? "" : "disabled"}>Build my recommendation</button></div>`;
  } else {
    const recommendationCapacity = adjustedCapacity(recommendation);
    const rankedRoutes = [...protocols].sort((a, b) => {
      if (a.id === recommendation.id) return -1;
      if (b.id === recommendation.id) return 1;
      const aFits = adjustedCapacity(a) >= state.amount ? 1 : 0;
      const bFits = adjustedCapacity(b) >= state.amount ? 1 : 0;
      return bFits - aFits || a.apr - b.apr;
    });
    content = `<p class="eyebrow">Your strongest fit</p><h2>${recommendation.name} fits this goal best.</h2><p class="muted">Based on a ${usd(state.amount)} ${state.loanPurpose.toLowerCase()} request, ${guidedPriorityLabel().toLowerCase()}, and a ${guidedRiskLabel().toLowerCase()} preference.</p>
      <article class="recommendation"><div>${protocolMark(recommendation)}<h3>${recommendation.reason}</h3><div class="guided-badges"><span class="confidence">${recommendation.confidence} confidence</span><span class="fit-label">Covers full request</span></div></div><div class="recommendation-price"><strong>${recommendation.apr}%</strong><span>${recommendation.rate.toLowerCase()} APR</span></div></article>
      <div class="stat-grid" style="margin-top:12px"><div class="stat"><span>Request</span><strong>${usd(state.amount)}</strong></div><div class="stat"><span>Capacity left</span><strong>${usd(Math.max(0, recommendationCapacity - state.amount))}</strong></div><div class="stat"><span>Risk signal</span><strong>${guidedRouteStatus(recommendation).label}</strong></div></div>
      <section class="guided-why"><p class="eyebrow">Why this ranked first</p><div class="guided-reasons"><div><strong>Fits the amount</strong><span>${Math.round((state.amount / recommendationCapacity) * 100)}% of estimated capacity</span></div><div><strong>Matches your priority</strong><span>${guidedPriorityLabel()}</span></div><div><strong>Timing</strong><span>${state.loanTiming}</span></div></div></section>
      <div class="button-row" style="margin-top:22px"><button class="button-primary" data-guided-detail="${recommendation.id}">Review ${recommendation.name} in detail</button><button class="button-secondary" data-guided-back>Change preferences</button></div>
      <section class="guided-alternatives"><div class="guided-section-head"><div><p class="eyebrow">All routes</p><h3>Compare before deciding</h3></div><span class="pill neutral">SAME WALLET SNAPSHOT</span></div><div class="guided-route-list">${rankedRoutes
        .map((protocol, index) => {
          const capacity = adjustedCapacity(protocol);
          const fits = capacity >= state.amount;
          const status = guidedRouteStatus(protocol);
          return `<article class="guided-route ${protocol.id === recommendation.id ? "recommended" : ""} ${fits ? "" : "unavailable"}"><div><span class="guided-route-rank">${index + 1}</span>${protocolMark(protocol)}${protocol.id === recommendation.id ? `<span class="fit-label">Recommended</span>` : ""}</div><dl><div><dt>Displayed APR</dt><dd>${protocol.apr}% ${protocol.rate.toLowerCase()}</dd></div><div><dt>Capacity</dt><dd>${usd(capacity)}</dd></div><div><dt>Fit</dt><dd><span class="fit-label ${status.tone}">${status.label}</span></dd></div></dl><p>${protocol.reason}</p><button class="button-quiet" data-guided-detail="${protocol.id}">${fits ? "Review route" : "See why it doesn’t fit"}</button></article>`;
        })
        .join("")}</div></section>`;
  }

  return `<div class="prototype-shell"><div class="guided-wrap ${step === 3 || state.guidedDetail ? "guided-wrap-expanded" : ""}">${intro("guided")}<div class="guided-progress" aria-label="Step ${step} of 3">${[1, 2, 3].map((item) => `<span class="${item <= step ? "active" : ""}"></span>`).join("")}</div><div class="guided-step-labels" aria-hidden="true"><span>1 · Goal</span><span>2 · Preferences</span><span>3 · Review</span></div>
    <section class="guided-panel panel ${state.guidedDetail ? "guided-panel-detail" : ""}"><div class="guided-main">${content}</div><aside class="guided-side"><span class="pill">DEMO WALLET</span><h3>powerrr.eth</h3><p>Ethereum · static block snapshot</p><div class="guided-summary"><span class="muted">Selected collateral</span><strong>${usd(totalCollateral)}</strong></div><div class="guided-brief"><div><span>Request</span><strong>${usd(state.amount)}</strong></div><div><span>Purpose</span><strong>${state.loanPurpose}</strong></div><div><span>Priority</span><strong>${guidedPriorityLabel()}</strong></div><div><span>Risk preference</span><strong>${guidedRiskLabel()}</strong></div></div><p class="guided-privacy">Your wallet stays read-only. Nothing is signed, moved, or submitted while exploring.</p></aside></section></div></div>`;
}

function rankedProtocols() {
  const score = (protocol) => {
    if (protocol.capacity < state.amount) return -100;
    if (state.priority === "cost") return 20 - protocol.apr;
    if (state.priority === "predictability")
      return protocol.id === "own" ? 30 : 10 - protocol.apr / 10;
    return (
      protocol.capacity / state.amount + (protocol.id === "own" ? 0.15 : 0)
    );
  };
  return [...protocols].sort((a, b) => score(b) - score(a));
}

function renderShortlist() {
  const ranked = rankedProtocols();
  return `<div class="prototype-shell">${intro("shortlist")}
    <div class="shortlist-layout">
      <aside class="sticky-controls panel">
        <p class="eyebrow">Your brief</p><h3>Borrowing goal</h3>
        <label class="field-label" for="shortlist-amount">Amount in USDC</label>
        <div class="amount-field"><span>$</span><input id="shortlist-amount" inputmode="numeric" value="${state.amount}" /></div>
        <h3 style="margin-top:24px">Rank by</h3>
        <div class="choice-grid">${[
          ["safety", "More buffer"],
          ["cost", "Lower rate"],
          ["predictability", "Predictable terms"],
        ]
          .map(
            ([id, label]) =>
              `<button class="choice" data-priority="${id}" aria-pressed="${state.priority === id}"><strong>${label}</strong></button>`,
          )
          .join("")}</div>
        <h3 style="margin-top:24px">Wallet</h3><p class="muted">powerrr.eth · ${usd(186390)} matched</p>${assetChips()}
      </aside>
      <section>
        <div class="shortlist-head"><div><p class="eyebrow">Personalized match</p><h2>${ranked.filter((protocol) => protocol.capacity >= state.amount).length} routes cover your full request</h2><p class="muted">Ranked by your current priority. Every metric uses the same ${usd(state.amount)} request.</p></div><span class="pill neutral">STATIC DATA</span></div>
        <div class="route-list">${ranked
          .map((protocol, index) => {
            const available = protocol.capacity >= state.amount;
            const usage = Math.round((state.amount / protocol.capacity) * 100);
            return `<article class="route-row ${index === 0 && available ? "top-fit" : ""} ${!available ? "unavailable" : ""}">
              <div class="protocol-cell">${protocolMark(protocol)}<p class="route-reason">${protocol.reason}</p></div>
              <dl><dt>Displayed APR</dt><dd>${protocol.apr}% ${protocol.rate.toLowerCase()}</dd></dl>
              <dl><dt>Capacity used</dt><dd>${available ? `${usage}%` : `${usd(protocol.capacity)} max`}</dd></dl>
              <dl><dt>Risk signal</dt><dd>${protocol.liquidation}</dd></dl>
              <div class="route-action">${available ? `<button class="button-secondary" data-request-details="${protocol.name}">${index === 0 ? "Review best fit" : "Review"}</button>` : `<span class="fit-label watch">Doesn’t fit</span>`}</div>
            </article>`;
          })
          .join("")}</div>
      </section>
    </div></div>`;
}

function selectedCollateralValue() {
  return assets
    .filter((asset) => state.selectedAssets.has(asset.id))
    .reduce((sum, asset) => sum + asset.value, 0);
}

function adjustedCapacity(protocol) {
  return Math.round(protocol.capacity * (selectedCollateralValue() / 186390));
}

function renderWorkbench() {
  const selected =
    protocols.find((protocol) => protocol.id === state.workbenchProtocol) ||
    protocols[1];
  const selectedCapacity = adjustedCapacity(selected);
  return `<div class="prototype-shell workbench-shell">${intro("workbench")}
    <section class="workbench panel">
      <aside class="workbench-side"><div class="wallet-block"><strong>powerrr.eth</strong><span>Ethereum · read-only</span><span>${usd(selectedCollateralValue())} included</span></div>
        <h3>Collateral assets</h3><p class="muted">Toggle assets to recalculate every route.</p>
        <div class="asset-list">${assets
          .map(
            (asset) =>
              `<button class="asset-toggle" data-asset-toggle="${asset.id}" aria-pressed="${state.selectedAssets.has(asset.id)}"><img src="${asset.image}" alt="" /><span><strong>${asset.name}</strong><small>${usd(asset.value)}</small></span><small>${state.selectedAssets.has(asset.id) ? "Included" : "Excluded"}</small></button>`,
          )
          .join("")}</div>
      </aside>
      <div class="workbench-main">
        <div class="workbench-toolbar"><div><p class="eyebrow">Normalized comparison</p><h3>Borrowing routes</h3></div><label class="compact-amount">$ <input id="workbench-amount" inputmode="numeric" value="${state.amount}" aria-label="Borrow amount" /> USDC</label></div>
        <table class="comparison-table">
          <thead><tr><th>Route</th><th>Capacity</th><th>APR</th><th>Structure</th><th>At ${usd(state.amount, true)}</th></tr></thead>
          <tbody>${protocols
            .map((protocol) => {
              const capacity = adjustedCapacity(protocol);
              const available = capacity >= state.amount;
              return `<tr data-workbench-row="${protocol.id}" class="${state.workbenchProtocol === protocol.id ? "selected" : ""}" tabindex="0">
                <td><strong>${protocol.name}</strong><br /><small class="muted">${protocol.confidence} confidence</small></td>
                <td><strong>${usd(capacity)}</strong><div class="capacity-bar"><span style="width:${Math.min(100, (capacity / 120000) * 100)}%"></span></div></td>
                <td><strong>${protocol.apr}%</strong><br /><small class="muted">${protocol.rate}</small></td>
                <td>${protocol.term}</td><td><span class="fit-label ${available ? "" : "watch"}">${available ? `${Math.round((state.amount / capacity) * 100)}% used` : "Over capacity"}</span></td>
              </tr>`;
            })
            .join("")}</tbody>
        </table>
        <p class="muted" style="margin-top:14px">Select a row for its assumptions and next step. Data is normalized to the same wallet snapshot.</p>
      </div>
      <aside class="workbench-detail"><p class="eyebrow">Selected route</p>${protocolMark(selected)}<p class="muted" style="margin-top:12px">${selected.reason}</p>
        <div class="detail-list"><div><span>Capacity</span><strong>${usd(selectedCapacity)}</strong></div><div><span>Request</span><strong>${usd(state.amount)}</strong></div><div><span>Displayed APR</span><strong>${selected.apr}% ${selected.rate.toLowerCase()}</strong></div><div><span>Risk signal</span><strong>${selected.liquidation}</strong></div><div><span>Term</span><strong>${selected.term}</strong></div></div>
        <button class="button-primary button-wide" data-request-details="${selected.name}" ${selectedCapacity < state.amount ? "disabled" : ""}>${selectedCapacity < state.amount ? "Request exceeds capacity" : `Review ${selected.name}`}</button>
      </aside>
    </section></div>`;
}

function riskMetrics() {
  const provider =
    protocols.find((protocol) => protocol.id === state.riskProtocol) ||
    protocols[1];
  const ratio = state.riskAmount / provider.capacity;
  const status =
    ratio <= 0.55 ? "Comfortable" : ratio <= 0.8 ? "Watch" : "Near the edge";
  const health = Math.max(1.04, 3.7 - ratio * 2).toFixed(2);
  const decline = Math.max(6, Math.round(78 - ratio * 31));
  return { provider, ratio, status, health, decline };
}

function renderRisk() {
  const metrics = riskMetrics();
  return `<div class="prototype-shell">${intro("risk")}
    <section class="risk-stage panel">
      <div class="risk-top">
        <div class="risk-visual"><p class="eyebrow">Borrow amount</p><h2>Find an amount you can live with.</h2><p class="muted">Move the amount and watch the safety buffer change before choosing a route.</p>
          <div class="risk-number"><strong>${usd(state.riskAmount)}</strong><span>of ${usd(metrics.provider.capacity)} capacity</span></div>
          <input class="risk-range" id="risk-amount" type="range" min="5000" max="${metrics.provider.capacity}" step="1000" value="${Math.min(state.riskAmount, metrics.provider.capacity)}" aria-label="Borrow amount" />
          <div class="risk-scale"><span class="zone-comfort">COMFORTABLE</span><span class="zone-watch">WATCH</span><span class="zone-edge">EDGE</span></div>
        </div>
        <div class="risk-controls"><p class="eyebrow">Current outcome</p><h2>${metrics.status} buffer</h2><p class="muted">At this amount, ${metrics.provider.name} uses ${Math.round(metrics.ratio * 100)}% of the estimated borrowing capacity.</p>
          <h3>Compare the same amount</h3><div class="provider-tabs">${protocols
            .filter((protocol) => protocol.id !== "own")
            .map(
              (protocol) =>
                `<button class="provider-tab" data-risk-provider="${protocol.id}" aria-pressed="${state.riskProtocol === protocol.id}">${protocol.name}</button>`,
            )
            .join("")}</div>
          <div class="stat-grid"><div class="stat"><span>Displayed APR</span><strong>${metrics.provider.apr}%</strong></div><div class="stat"><span>Health factor</span><strong>${metrics.health}</strong></div><div class="stat"><span>Capacity used</span><strong>${Math.round(metrics.ratio * 100)}%</strong></div></div>
          <div class="button-row" style="margin-top:22px"><button class="button-primary" data-request-details="${metrics.provider.name}">Review this amount</button><button class="button-secondary" data-toast="A fixed-term OWN comparison would open beside the pooled risk profile.">Compare fixed term</button></div>
        </div>
      </div>
      <div class="risk-outcomes"><div class="risk-outcome"><span>If collateral drops</span><strong>${metrics.decline}%</strong><small>Estimated decline before reaching the displayed provider threshold.</small></div><div class="risk-outcome"><span>At today’s rate</span><strong>${usd((state.riskAmount * metrics.provider.apr) / 100)}</strong><small>Illustrative interest over one year if the variable rate did not change.</small></div><div class="risk-outcome"><span>Capacity left</span><strong>${usd(Math.max(0, metrics.provider.capacity - state.riskAmount))}</strong><small>Unused estimated borrowing power on ${metrics.provider.name}.</small></div></div>
    </section></div>`;
}

const questions = [
  {
    prompt: "What matters most about this loan?",
    options: [
      ["Avoid selling my assets", "Hold my position"],
      ["Keep the cost low", "Lowest displayed rate"],
      ["Know exactly what I owe", "Predictable repayment"],
      ["I’m just exploring", "See what is possible"],
    ],
    key: "goal",
  },
  {
    prompt: "How much market movement should the loan tolerate?",
    options: [
      ["Leave plenty of room", "Comfortable buffer"],
      ["Balance access and risk", "Balanced buffer"],
      ["Use more of my capacity", "Higher utilization"],
      ["Show me the trade-off", "Decide after comparing"],
    ],
    key: "risk",
  },
  {
    prompt: "Roughly how much USDC would be useful?",
    options: [
      ["$25,000", "25% of pooled max"],
      ["$55,000", "50% of pooled max"],
      ["$80,000", "72% of pooled max"],
      ["Not sure yet", "Start with a safe range"],
    ],
    key: "amount",
  },
];

function guideRecommendation() {
  if (state.guidePreferences.goal.includes("exactly")) return protocols[0];
  if (state.guidePreferences.goal.includes("cost")) return protocols[2];
  return protocols[1];
}

function renderConcierge() {
  const complete = state.conversationStep >= questions.length;
  const question =
    questions[Math.min(state.conversationStep, questions.length - 1)];
  const recommended = guideRecommendation();
  return `<div class="prototype-shell concierge-shell"><div class="concierge-wrap">${intro("concierge")}
    <section class="concierge-card">
      <div class="conversation"><p class="eyebrow">Powerrr borrowing guide</p><h2>${complete ? "Here’s a sensible place to start." : question.prompt}</h2>
        <div class="conversation-log" aria-live="polite"><div class="message guide">I found ${usd(186390)} in supported assets in powerrr.eth. I’ll ask three questions, then explain the best starting point.</div>${state.conversation
          .map((item) => `<div class="message user">${item}</div>`)
          .join(
            "",
          )}${complete ? `<div class="message guide">Based on those answers, ${recommended.name} is the strongest starting point. You can still compare every alternative before taking action.</div>` : ""}</div>
        ${
          complete
            ? `<div class="button-row"><button class="button-primary" data-request-details="${recommended.name}">Review ${recommended.name}</button><button class="button-secondary" data-conversation-reset>Start over</button></div>`
            : `<div class="prompt-options">${question.options.map(([label, description]) => `<button class="prompt-option" data-conversation-answer="${label}">${label}<br /><small class="muted">${description}</small></button>`).join("")}</div>`
        }
      </div>
      <aside class="concierge-summary"><p class="eyebrow">Your borrowing brief</p><h3>powerrr.eth</h3><p class="muted">Built from your answers. Nothing is submitted.</p>
        <div class="summary-line"><span>Goal</span><strong>${state.guidePreferences.goal}</strong></div><div class="summary-line"><span>Risk preference</span><strong>${state.guidePreferences.risk}</strong></div><div class="summary-line"><span>Amount</span><strong>${state.guidePreferences.amount}</strong></div>
        ${
          complete
            ? `<div class="guide-result">${protocolMark(recommended)}<p>${recommended.reason}</p><span class="fit-label">Strongest starting point</span></div>`
            : `<p class="muted" style="margin-top:24px">The recommendation will appear after three short answers.</p>`
        }
      </aside>
    </section></div></div>`;
}

function render() {
  document.documentElement.dataset.concept = state.concept;
  document.querySelectorAll("[data-concept-link]").forEach((link) => {
    if (link.dataset.conceptLink === state.concept)
      link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  if (state.concept === "guided") prototype.innerHTML = renderGuided();
  if (state.concept === "shortlist") prototype.innerHTML = renderShortlist();
  if (state.concept === "workbench") prototype.innerHTML = renderWorkbench();
  if (state.concept === "risk") prototype.innerHTML = renderRisk();
  if (state.concept === "concierge") prototype.innerHTML = renderConcierge();
  bindInteractions();
}

function bindInteractions() {
  document.querySelectorAll("[data-priority]").forEach((button) => {
    button.addEventListener("click", () => {
      state.priority = button.dataset.priority;
      render();
    });
  });

  document.querySelectorAll("[data-guided-amount]").forEach((button) => {
    button.addEventListener("click", () => {
      state.amount = Number(button.dataset.guidedAmount);
      render();
    });
  });

  document
    .querySelector("#guided-amount")
    ?.addEventListener("input", (event) => {
      state.amount = clampAmount(event.target.value);
    });

  document
    .querySelector("#guided-amount")
    ?.addEventListener("change", (event) => {
      state.amount = clampAmount(event.target.value);
      render();
    });

  document.querySelectorAll("[data-guided-purpose]").forEach((button) => {
    button.addEventListener("click", () => {
      state.loanPurpose = button.dataset.guidedPurpose;
      render();
    });
  });

  document
    .querySelector("#guided-timing")
    ?.addEventListener("change", (event) => {
      state.loanTiming = event.target.value;
      render();
    });

  document.querySelectorAll("[data-guided-risk]").forEach((button) => {
    button.addEventListener("click", () => {
      state.riskComfort = button.dataset.guidedRisk;
      render();
    });
  });

  document.querySelectorAll("[data-guided-asset]").forEach((button) => {
    button.addEventListener("click", () => {
      const asset = button.dataset.guidedAsset;
      if (state.selectedAssets.has(asset)) {
        if (state.selectedAssets.size === 1) {
          showToast("Keep at least one collateral asset included.");
          return;
        }
        state.selectedAssets.delete(asset);
      } else state.selectedAssets.add(asset);
      render();
    });
  });

  document
    .querySelector("[data-guided-next]")
    ?.addEventListener("click", () => {
      state.guidedStep = Math.min(3, state.guidedStep + 1);
      render();
      scrollToGuidedFlow();
    });

  document
    .querySelector("[data-guided-back]")
    ?.addEventListener("click", () => {
      state.guidedStep = Math.max(1, state.guidedStep - 1);
      render();
      scrollToGuidedFlow();
    });

  document.querySelectorAll("[data-guided-detail]").forEach((button) => {
    button.addEventListener("click", () => {
      state.guidedDetail = button.dataset.guidedDetail;
      render();
      document.querySelector("#prototype")?.focus({ preventScroll: true });
      scrollToGuidedFlow();
    });
  });

  document.querySelectorAll("[data-guided-close-detail]").forEach((button) => {
    button.addEventListener("click", () => {
      state.guidedDetail = null;
      render();
      scrollToGuidedFlow();
    });
  });

  document
    .querySelector("#shortlist-amount")
    ?.addEventListener("change", (event) => {
      state.amount = clampAmount(event.target.value);
      render();
    });

  document.querySelectorAll("[data-asset-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const asset = button.dataset.assetToggle;
      if (state.selectedAssets.has(asset)) {
        if (state.selectedAssets.size === 1) {
          showToast("Keep at least one asset included for the comparison.");
          return;
        }
        state.selectedAssets.delete(asset);
      } else state.selectedAssets.add(asset);
      render();
    });
  });

  document.querySelectorAll("[data-workbench-row]").forEach((row) => {
    const select = () => {
      state.workbenchProtocol = row.dataset.workbenchRow;
      render();
    };
    row.addEventListener("click", select);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    });
  });

  document
    .querySelector("#workbench-amount")
    ?.addEventListener("change", (event) => {
      state.amount = clampAmount(event.target.value);
      render();
    });

  document.querySelectorAll("[data-risk-provider]").forEach((button) => {
    button.addEventListener("click", () => {
      state.riskProtocol = button.dataset.riskProvider;
      const provider = protocols.find((item) => item.id === state.riskProtocol);
      state.riskAmount = Math.min(state.riskAmount, provider.capacity);
      render();
    });
  });

  document.querySelector("#risk-amount")?.addEventListener("input", (event) => {
    state.riskAmount = Number(event.target.value);
    render();
  });

  document.querySelectorAll("[data-conversation-answer]").forEach((button) => {
    button.addEventListener("click", () => {
      const answer = button.dataset.conversationAnswer;
      const question = questions[state.conversationStep];
      state.conversation.push(answer);
      state.guidePreferences[question.key] = answer;
      state.conversationStep += 1;
      render();
    });
  });

  document
    .querySelector("[data-conversation-reset]")
    ?.addEventListener("click", () => {
      state.conversationStep = 0;
      state.conversation = [];
      state.guidePreferences = {
        goal: "Not answered",
        risk: "Not answered",
        amount: "Not answered",
      };
      render();
    });

  document.querySelectorAll("[data-request-details]").forEach((button) => {
    button.addEventListener("click", () =>
      showToast(
        `${button.dataset.requestDetails} detail would open next. This experiment stops at the decision.`,
      ),
    );
  });

  document.querySelectorAll("[data-toast]").forEach((button) => {
    button.addEventListener("click", () => showToast(button.dataset.toast));
  });
}

render();
