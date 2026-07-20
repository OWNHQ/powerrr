<script setup lang="ts">
import type {
  BorrowerRiskAssessment,
  BorrowerRiskAssessmentRequest,
  BorrowerRiskScenarioResponse,
  EvidenceStatus,
  EmploymentStatus,
} from "@powerrr/shared-types";

type MarketPreset = {
  spotPriceUsd: number;
  annualVolatility: number;
  maxDrawdown365d: number;
  volume24hUsd: number;
};

const marketPresets: Record<string, MarketPreset> = {
  ETH: {
    spotPriceUsd: 3_800,
    annualVolatility: 0.68,
    maxDrawdown365d: 0.62,
    volume24hUsd: 15_000_000_000,
  },
  BTC: {
    spotPriceUsd: 108_000,
    annualVolatility: 0.52,
    maxDrawdown365d: 0.48,
    volume24hUsd: 28_000_000_000,
  },
  SOL: {
    spotPriceUsd: 165,
    annualVolatility: 0.86,
    maxDrawdown365d: 0.72,
    volume24hUsd: 4_000_000_000,
  },
};

const form = reactive({
  applicationId: "example-001",
  annualGrossIncomeUsd: 240_000,
  monthlyNetIncomeUsd: 13_000,
  monthlyDebtPaymentsUsd: 1_500,
  monthlyLivingExpensesUsd: 4_000,
  employmentStatus: "employed" as EmploymentStatus,
  incomeEvidence: "verified" as EvidenceStatus,
  creditScore: 760,
  missedPayments24m: 0,
  defaultsOrCollections: 0,
  activeBankruptcy: false,
  creditEvidence: "verified" as EvidenceStatus,
  requestedPrincipalUsd: 50_000,
  annualRatePct: 12,
  durationMonths: 60,
  creditToken: "USDC",
  collateralAsset: "ETH",
  collateralAmount: 32,
  custodyModel:
    "qualified-custodian" as BorrowerRiskAssessmentRequest["collateral"]["custodyModel"],
  oracleModel:
    "multi-source" as BorrowerRiskAssessmentRequest["collateral"]["oracleModel"],
  hedgeFloorUsd: 70_000,
  marketEvidence: "verified" as EvidenceStatus,
});

const assessment = ref<BorrowerRiskAssessment | null>(null);
const scenarios = ref<BorrowerRiskScenarioResponse | null>(null);
const loading = ref(false);
const scenarioLoading = ref(false);
const errorMessage = ref<string | null>(null);

const examples = [
  { id: "verified", label: "Verified base case" },
  { id: "stretched", label: "Stretched affordability" },
  { id: "unverified", label: "Unverified evidence" },
  { id: "high-risk", label: "High-risk history" },
] as const;

function buildRequest(): BorrowerRiskAssessmentRequest {
  const market = marketPresets[form.collateralAsset] ?? marketPresets.ETH!;
  return {
    applicationId: form.applicationId,
    borrower: {
      financials: {
        annualGrossIncomeUsd: form.annualGrossIncomeUsd,
        monthlyNetIncomeUsd: form.monthlyNetIncomeUsd,
        monthlyDebtPaymentsUsd: form.monthlyDebtPaymentsUsd,
        monthlyLivingExpensesUsd: form.monthlyLivingExpensesUsd,
        employmentStatus: form.employmentStatus,
        incomeEvidence: form.incomeEvidence,
      },
      credit: {
        creditScore: form.creditScore,
        creditScoreScale: "FICO 300-850 example",
        missedPayments24m: form.missedPayments24m,
        defaultsOrCollections: form.defaultsOrCollections,
        activeBankruptcy: form.activeBankruptcy,
        creditEvidence: form.creditEvidence,
      },
    },
    facility: {
      requestedPrincipalUsd: form.requestedPrincipalUsd,
      annualRate: form.annualRatePct / 100,
      durationMonths: form.durationMonths,
      repaymentType: "amortizing",
      creditToken: form.creditToken,
    },
    collateral: {
      asset: form.collateralAsset,
      amount: form.collateralAmount,
      spotPriceUsd: market.spotPriceUsd,
      annualVolatility: market.annualVolatility,
      maxDrawdown365d: market.maxDrawdown365d,
      volume24hUsd: market.volume24hUsd,
      custodyModel: form.custodyModel,
      oracleModel: form.oracleModel,
      hedgeFloorUsd: form.hedgeFloorUsd,
      marketEvidence: form.marketEvidence,
    },
  };
}

async function submitAssessment() {
  loading.value = true;
  errorMessage.value = null;
  scenarios.value = null;
  try {
    assessment.value = await $fetch<BorrowerRiskAssessment>("/api/assessment", {
      method: "POST",
      body: buildRequest(),
    });
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "Assessment failed";
  } finally {
    loading.value = false;
  }
}

async function runScenarios() {
  scenarioLoading.value = true;
  errorMessage.value = null;
  try {
    scenarios.value = await $fetch<BorrowerRiskScenarioResponse>(
      "/api/borrower-scenarios",
      {
        method: "POST",
        body: { assessment: buildRequest() },
      },
    );
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "Scenario analysis failed";
  } finally {
    scenarioLoading.value = false;
  }
}

async function applyExample(id: (typeof examples)[number]["id"]) {
  Object.assign(form, {
    annualGrossIncomeUsd: 240_000,
    monthlyNetIncomeUsd: 13_000,
    monthlyDebtPaymentsUsd: 1_500,
    monthlyLivingExpensesUsd: 4_000,
    employmentStatus: "employed",
    incomeEvidence: "verified",
    creditScore: 760,
    missedPayments24m: 0,
    defaultsOrCollections: 0,
    activeBankruptcy: false,
    creditEvidence: "verified",
    requestedPrincipalUsd: 50_000,
    annualRatePct: 12,
    durationMonths: 60,
    collateralAsset: "ETH",
    collateralAmount: 32,
    marketEvidence: "verified",
  });

  if (id === "stretched") {
    Object.assign(form, {
      annualGrossIncomeUsd: 95_000,
      monthlyNetIncomeUsd: 5_700,
      monthlyDebtPaymentsUsd: 2_400,
      requestedPrincipalUsd: 70_000,
    });
  } else if (id === "unverified") {
    Object.assign(form, {
      incomeEvidence: "stated",
      creditEvidence: "stated",
      marketEvidence: "stated",
    });
  } else if (id === "high-risk") {
    Object.assign(form, {
      missedPayments24m: 4,
      defaultsOrCollections: 1,
      requestedPrincipalUsd: 80_000,
    });
  }
  await submitAssessment();
}

function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Uncalibrated";
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

onMounted(submitAssessment);
</script>

<template>
  <main class="app-shell">
    <section class="quote-panel" aria-label="Borrower risk inputs">
      <header class="brand">
        <div>
          <p class="eyebrow">Decision-support workbench</p>
          <h1>Powerrr Risk</h1>
          <p class="subhead">
            Assess the borrower, facility, collateral, and recovery path
            separately.
          </p>
        </div>
        <span class="model-chip"
          >Policy {{ assessment?.policy.version ?? "loading" }}</span
        >
      </header>

      <p class="privacy-note">
        Open policy · minimal data · no automated approval. Example values stay
        in this browser session.
      </p>

      <div class="scenario-strip" aria-label="Loan examples">
        <button
          v-for="example in examples"
          :key="example.id"
          type="button"
          @click="applyExample(example.id)"
        >
          {{ example.label }}
        </button>
      </div>

      <form class="risk-form" @submit.prevent="submitAssessment">
        <fieldset class="form-section">
          <legend>Facility</legend>
          <div class="field-grid">
            <label
              >Requested principal<input
                v-model.number="form.requestedPrincipalUsd"
                type="number"
                min="1"
                step="1000"
            /></label>
            <label
              >Annual rate (%)<input
                v-model.number="form.annualRatePct"
                type="number"
                min="0"
                max="100"
                step="0.1"
            /></label>
            <label
              >Term (months)<input
                v-model.number="form.durationMonths"
                type="number"
                min="3"
                max="360"
                step="1"
            /></label>
            <label
              >Credit token<select v-model="form.creditToken">
                <option>USDC</option>
                <option>USD</option>
                <option>DAI</option>
              </select></label
            >
          </div>
        </fieldset>

        <fieldset class="form-section">
          <legend>Borrower affordability</legend>
          <div class="field-grid">
            <label
              >Annual gross income<input
                v-model.number="form.annualGrossIncomeUsd"
                type="number"
                min="0"
                step="1000"
            /></label>
            <label
              >Monthly net income<input
                v-model.number="form.monthlyNetIncomeUsd"
                type="number"
                min="0"
                step="100"
            /></label>
            <label
              >Existing debt / month<input
                v-model.number="form.monthlyDebtPaymentsUsd"
                type="number"
                min="0"
                step="100"
            /></label>
            <label
              >Living expenses / month<input
                v-model.number="form.monthlyLivingExpensesUsd"
                type="number"
                min="0"
                step="100"
            /></label>
            <label
              >Employment<select v-model="form.employmentStatus">
                <option value="employed">Employed</option>
                <option value="self-employed">Self-employed</option>
                <option value="contract">Contract</option>
                <option value="retired">Retired</option>
                <option value="unemployed">Unemployed</option>
                <option value="other">Other</option>
              </select></label
            >
            <label
              >Income evidence<select v-model="form.incomeEvidence">
                <option value="verified">Verified</option>
                <option value="stated">Stated only</option>
                <option value="missing">Missing</option>
              </select></label
            >
          </div>
        </fieldset>

        <fieldset class="form-section">
          <legend>Credit history</legend>
          <div class="field-grid">
            <label
              >Example credit score<input
                v-model.number="form.creditScore"
                type="number"
                min="0"
                max="10000"
            /></label>
            <label
              >Missed payments (24m)<input
                v-model.number="form.missedPayments24m"
                type="number"
                min="0"
                step="1"
            /></label>
            <label
              >Defaults / collections<input
                v-model.number="form.defaultsOrCollections"
                type="number"
                min="0"
                step="1"
            /></label>
            <label
              >Credit evidence<select v-model="form.creditEvidence">
                <option value="verified">Verified</option>
                <option value="stated">Stated only</option>
                <option value="missing">Missing</option>
              </select></label
            >
          </div>
          <label class="toggle"
            ><input v-model="form.activeBankruptcy" type="checkbox" /><span
              >Active bankruptcy reported</span
            ></label
          >
        </fieldset>

        <fieldset class="form-section">
          <legend>Collateral and recovery</legend>
          <div class="field-grid">
            <label
              >Asset<select v-model="form.collateralAsset">
                <option>ETH</option>
                <option>BTC</option>
                <option>SOL</option>
              </select></label
            >
            <label
              >Amount<input
                v-model.number="form.collateralAmount"
                type="number"
                min="0.0001"
                step="0.01"
            /></label>
            <label
              >Custody<select v-model="form.custodyModel">
                <option value="qualified-custodian">Qualified custodian</option>
                <option value="self-custody">Self-custody</option>
                <option value="third-party">Third party</option>
              </select></label
            >
            <label
              >Oracle<select v-model="form.oracleModel">
                <option value="multi-source">Multi-source</option>
                <option value="protocol-native">Protocol native</option>
                <option value="single-source">Single source</option>
                <option value="manual">Manual</option>
              </select></label
            >
            <label
              >Hedge recovery floor<input
                v-model.number="form.hedgeFloorUsd"
                type="number"
                min="0"
                step="1000"
            /></label>
            <label
              >Market evidence<select v-model="form.marketEvidence">
                <option value="verified">Verified</option>
                <option value="stated">Stated only</option>
                <option value="missing">Missing</option>
              </select></label
            >
          </div>
        </fieldset>

        <div class="actions">
          <button class="primary" type="submit" :disabled="loading">
            {{ loading ? "Assessing…" : "Run assessment" }}
          </button>
          <button
            class="secondary"
            type="button"
            :disabled="scenarioLoading"
            @click="runScenarios"
          >
            {{ scenarioLoading ? "Stressing…" : "Run all stresses" }}
          </button>
        </div>
      </form>
    </section>

    <section
      class="results"
      aria-label="Borrower risk result"
      aria-live="polite"
    >
      <div v-if="errorMessage" class="warnings">
        <div class="warning">{{ errorMessage }}</div>
      </div>
      <template v-if="assessment">
        <header class="result-header">
          <div>
            <p class="eyebrow">Recommendation</p>
            <h2>{{ assessment.recommendation.replace("-", " ") }}</h2>
          </div>
          <span class="badge" :class="assessment.riskBand"
            >{{ assessment.riskBand }} · {{ assessment.riskScore }}/100</span
          >
        </header>

        <div class="headline">
          <span>Supported principal</span>
          <strong>{{
            formatUsd(assessment.facility.supportedPrincipalUsd)
          }}</strong>
          <small v-if="assessment.facility.counterofferPrincipalUsd"
            >Counteroffer available at
            {{ formatUsd(assessment.facility.counterofferPrincipalUsd) }}</small
          >
        </div>

        <div class="metrics">
          <div>
            <span>Stressed payment</span
            ><strong>{{
              formatUsd(assessment.affordability.stressedMonthlyPaymentUsd)
            }}</strong>
          </div>
          <div>
            <span>Total debt service</span
            ><strong>{{
              formatPct(assessment.affordability.totalDebtServiceRatio)
            }}</strong>
          </div>
          <div>
            <span>Residual income</span
            ><strong>{{
              formatUsd(assessment.affordability.monthlyResidualIncomeUsd)
            }}</strong>
          </div>
          <div>
            <span>Requested LTV</span
            ><strong>{{
              formatPct(assessment.collateral.requestedLtv)
            }}</strong>
          </div>
        </div>

        <section class="risk-list">
          <div class="section-heading">
            <h2>Main risks</h2>
            <span>{{
              assessment.dataQuality.complete
                ? "Evidence verified"
                : "Evidence review required"
            }}</span>
          </div>
          <article
            v-if="assessment.topRisks.length === 0"
            class="risk-card info"
          >
            <strong>No material policy exceptions</strong>
            <p>
              The application remains inside the provisional transparent
              scorecard.
            </p>
          </article>
          <article
            v-for="risk in assessment.topRisks"
            :key="risk.code"
            class="risk-card"
            :class="risk.severity"
          >
            <div>
              <strong>{{ risk.title }}</strong
              ><code>{{ risk.code }}</code>
            </div>
            <p>{{ risk.explanation }}</p>
          </article>
        </section>

        <div class="sections">
          <article>
            <h2>Collateral</h2>
            <dl>
              <dt>Spot value</dt>
              <dd>{{ formatUsd(assessment.collateral.spotValueUsd) }}</dd>
              <dt>Stressed value</dt>
              <dd>{{ formatUsd(assessment.collateral.stressedValueUsd) }}</dd>
              <dt>Maximum LTV</dt>
              <dd>{{ formatPct(assessment.collateral.maximumLtv) }}</dd>
              <dt>Cure coverage</dt>
              <dd>{{ assessment.collateral.cureMonths }} months</dd>
            </dl>
          </article>
          <article>
            <h2>Loss view</h2>
            <dl>
              <dt>PD</dt>
              <dd>{{ formatPct(assessment.loss.probabilityOfDefault) }}</dd>
              <dt>LGD</dt>
              <dd>{{ formatPct(assessment.loss.lossGivenDefault) }}</dd>
              <dt>EAD</dt>
              <dd>{{ formatUsd(assessment.loss.exposureAtDefaultUsd) }}</dd>
              <dt>Expected loss</dt>
              <dd>{{ formatUsd(assessment.loss.expectedLossUsd) }}</dd>
            </dl>
          </article>
        </div>

        <section v-if="scenarios" class="scenario-results">
          <div class="section-heading">
            <h2>Stress scenarios</h2>
            <span>{{ scenarios.results.length }} scenarios</span>
          </div>
          <div
            class="scenario-table"
            role="table"
            aria-label="Stress scenario results"
          >
            <div
              v-for="item in scenarios.results"
              :key="item.scenarioId"
              class="scenario-row"
              role="row"
            >
              <div>
                <strong>{{ item.label }}</strong
                ><small>{{ item.description }}</small>
              </div>
              <div>
                <span>Capacity</span
                ><strong>{{
                  formatUsd(item.stressed.supportedPrincipalUsd)
                }}</strong>
              </div>
              <div>
                <span>Risk</span
                ><strong>{{ item.stressed.riskScore }}/100</strong>
              </div>
            </div>
          </div>
        </section>

        <div class="warnings">
          <div
            v-for="warning in assessment.warnings"
            :key="warning"
            class="warning"
          >
            {{ warning }}
          </div>
        </div>
      </template>
    </section>
  </main>
</template>
