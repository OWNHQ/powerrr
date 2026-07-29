<script setup lang="ts">
import {
  PhArrowSquareOut,
  PhCaretDown,
  PhCheck,
  PhInfo,
  PhMoon,
  PhSun,
  PhUser,
  PhWallet,
  PhWarningCircle,
} from "@phosphor-icons/vue";
import type { ProtocolBorrowQuote } from "@powerrr/shared-types";
import {
  calculatePooledBorrowPreview,
  pooledRiskDescription,
  pooledRiskTitle,
} from "./utils/borrow-preview";
import {
  amountForUtilization,
  amountInputStep,
  formatUsdValue,
  ownFundingStatusLabel,
  providerRateLabel,
  summarizeEstimatorCapacity,
} from "./utils/estimator-ux";
import { formatLocalDateTime } from "./utils/date-time";
import {
  groupWebsiteQuoteRows,
  type WebsiteQuoteGroup,
} from "./utils/quote-row";

type EstimatorStage = "assets" | "terms" | "options";
type ProviderItem = {
  id: "aave" | "sparklend" | "compound-iii" | "morpho-blue";
  label: string;
  link: string;
  group?: WebsiteQuoteGroup;
};

const {
  announcedProviders,
  account,
  compactAccount,
  resolvedWalletNames,
  progress,
  valuedAssets,
  manualReviewAssets,
  failedAssets,
  selectedAssets,
  selectedCollateralTokens,
  receipt,
  ownOpportunity,
  quotes,
  error,
  isScanning,
  isComparing,
  walletDiscoveryComplete,
  connect,
  scan,
  switchToMainnet,
  disconnect,
  setAssetSelected,
  compareSelectedAssets,
  openExternal,
} = useStaticEstimator();
const { isDark, toggleLabel, toggleTheme } = useTheme();

const currentStage = ref<EstimatorStage>("assets");
const selectedProviderId = ref("");
const borrowAmountUsd = ref(0);
const stageError = ref("");
const showWalletMenu = ref(false);
const showWalletReadInfo = ref(false);
const walletIdentityLabel = computed(() =>
  resolvedWalletNames.value.length
    ? resolvedWalletNames.value.join(" · ")
    : compactAccount.value,
);
const walletIdentityTitle = computed(() =>
  [...resolvedWalletNames.value, compactAccount.value]
    .filter(Boolean)
    .join(" · "),
);
const blockLoadedAtLabel = computed(() =>
  receipt.value ? formatLocalDateTime(receipt.value.blockTimestamp) : "",
);

const providerDefinitions: Array<Omit<ProviderItem, "group">> = [
  { id: "aave", label: "Aave", link: "https://app.aave.com/" },
  { id: "sparklend", label: "Spark", link: "https://app.spark.fi/" },
  { id: "morpho-blue", label: "Morpho", link: "https://app.morpho.org/" },
  {
    id: "compound-iii",
    label: "Compound",
    link: "https://app.compound.finance/",
  },
];

const quoteGroups = computed(() => groupWebsiteQuoteRows(quotes.value));
const providerItems = computed<ProviderItem[]>(() =>
  providerDefinitions
    .map((definition) => ({
      ...definition,
      group: quoteGroups.value.find(
        (candidate) => candidate.groupId === definition.id,
      ),
    }))
    .sort((left, right) => providerCapacity(right) - providerCapacity(left)),
);
const matchingProviderItems = computed(() =>
  providerItems.value.filter(
    (provider) =>
      providerCapacity(provider) > 0 &&
      providerCapacity(provider) >= borrowAmountUsd.value,
  ),
);
const selectedProvider = computed(
  () =>
    providerItems.value.find(
      (provider) => provider.id === selectedProviderId.value,
    ) ?? null,
);
const selectedQuote = computed<ProtocolBorrowQuote | null>(
  () => selectedProvider.value?.group?.primaryQuote ?? null,
);
// OWN policy values are intentionally not exposed until credit policy and
// repayment terms receive explicit production approval.
const ownPotentialUsd = computed(() => 0);
const capacitySummary = computed(() =>
  summarizeEstimatorCapacity(
    providerItems.value.map((provider) => providerCapacity(provider)),
    ownPotentialUsd.value,
  ),
);
const providerMaximumUsd = computed(
  () => capacitySummary.value.providerMaximumUsd,
);
const maximumRequestableUsd = computed(
  () => capacitySummary.value.maximumRequestableUsd,
);
const providerPathCount = computed(
  () => capacitySummary.value.providerPathCount,
);
const selectedCapacity = computed(() =>
  selectedProviderId.value === "own"
    ? ownPotentialUsd.value
    : (selectedQuote.value?.safeBorrowUsd ?? 0),
);
const matchedCollateralUsd = computed(() =>
  selectedAssets.value.reduce(
    (sum, asset) => sum + Number(asset.balance) * (asset.marketPriceUsd ?? 0),
    0,
  ),
);
const ownFundingLabel = computed(() =>
  ownFundingStatusLabel(ownOpportunity.value?.fundingStatus),
);
const pooledPreview = computed(() =>
  selectedQuote.value
    ? calculatePooledBorrowPreview(selectedQuote.value, borrowAmountUsd.value)
    : null,
);
const pooledRateLabel = computed(() =>
  selectedQuote.value ? providerRateLabel(selectedQuote.value) : "—",
);
const selectedRiskTitle = computed(() => {
  if (selectedProviderId.value === "own") return "Fixed-term repayment plan";
  return pooledRiskTitle(pooledPreview.value?.riskBand ?? "none");
});
const selectedRiskDescription = computed(() => {
  if (selectedProviderId.value === "own") {
    return "OWN assessments require policy review; no numeric capacity or repayment projection is currently published.";
  }
  if (pooledPreview.value?.reasonCodes.includes("below-protocol-minimum")) {
    return `The projected position is below this protocol's ${formatUsdValue(pooledPreview.value.minimumBorrowUsd)} minimum borrow.`;
  }
  return pooledRiskDescription(pooledPreview.value?.riskBand ?? "none");
});
const utilizationPercent = computed(() =>
  selectedCapacity.value > 0
    ? (borrowAmountUsd.value / selectedCapacity.value) * 100
    : 0,
);
const riskAnnouncement = computed(() =>
  selectedProviderId.value
    ? `${selectedRiskTitle.value}. The amount reviewed is ${Math.round(utilizationPercent.value)} percent of Powerrr's estimated path limit.`
    : "Select a borrowing path to review its risk.",
);

watch(receipt, (next) => {
  if (!next) return;
  currentStage.value = "assets";
  selectedProviderId.value = "";
  borrowAmountUsd.value = 0;
  stageError.value = "";
});

async function continueFromAssets(): Promise<void> {
  if (!selectedCollateralTokens.value.length) {
    stageError.value = "Select at least one collateral asset to continue.";
    return;
  }
  stageError.value = "";
  await compareSelectedAssets();
  currentStage.value = "terms";
  selectedProviderId.value = "";
  borrowAmountUsd.value = amountForUtilization(maximumRequestableUsd.value, 50);
  await scrollToWorkflow();
}

function continueFromTerms(): void {
  if (borrowAmountUsd.value <= 0) {
    stageError.value = "Enter the amount of USDC you want to borrow.";
    return;
  }
  if (borrowAmountUsd.value > maximumRequestableUsd.value) {
    stageError.value = `Enter an amount up to ${formatUsdValue(maximumRequestableUsd.value)}.`;
    return;
  }
  stageError.value = "";
  selectedProviderId.value = "";
  currentStage.value = "options";
  void scrollToWorkflow();
}

function goToStage(stage: EstimatorStage): void {
  if (stage === "terms" && !selectedCollateralTokens.value.length) return;
  if (
    stage === "options" &&
    (borrowAmountUsd.value <= 0 ||
      borrowAmountUsd.value > maximumRequestableUsd.value)
  ) {
    return;
  }
  currentStage.value = stage;
  stageError.value = "";
  void scrollToWorkflow();
}

function selectProvider(id: string, capacity: number): void {
  if (capacity < borrowAmountUsd.value) return;
  selectedProviderId.value = id;
}

function onSelectedAmountInput(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  if (Number.isFinite(value)) {
    borrowAmountUsd.value = Math.max(
      0,
      Math.min(selectedCapacity.value, value),
    );
  }
}

function setSelectedUtilization(percent: number): void {
  borrowAmountUsd.value = amountForUtilization(selectedCapacity.value, percent);
}

async function refreshEstimate(): Promise<void> {
  await scan();
  currentStage.value = "assets";
  selectedProviderId.value = "";
  borrowAmountUsd.value = 0;
}

function continueWithSelection(): void {
  if (selectedProvider.value && pooledPreview.value?.actionable) {
    openExternal(selectedProvider.value.link);
  }
}

function connectFromHeader(): void {
  if (announcedProviders.value.length === 1 && announcedProviders.value[0]) {
    void connect(announcedProviders.value[0]);
    return;
  }
  if (announcedProviders.value.length > 1) {
    showWalletMenu.value = !showWalletMenu.value;
    return;
  }
  document
    .querySelector<HTMLElement>("#wallet-options")
    ?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function connectFromMenu(
  wallet: (typeof announcedProviders.value)[number],
): void {
  showWalletMenu.value = false;
  void connect(wallet);
}

function providerCapacity(provider: ProviderItem): number {
  return provider.group?.primaryQuote.safeBorrowUsd ?? 0;
}

async function scrollToWorkflow(): Promise<void> {
  await nextTick();
  document.querySelector<HTMLElement>("#workflow")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}
</script>

<template>
  <a href="#main-content" class="skip-link">Skip to estimator</a>
  <main id="main-content" class="min-h-screen bg-paper text-ink">
    <header
      class="sticky top-0 z-30 border-b border-line/80 bg-surface/95 backdrop-blur"
    >
      <div
        class="mx-auto flex h-16 w-full max-w-[1360px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"
      >
        <a
          href="/"
          class="focus-ring rounded-md text-2xl font-bold tracking-[-0.04em]"
        >
          Powerrr
        </a>
        <div class="flex min-w-0 items-center gap-2">
          <button
            type="button"
            class="focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-line bg-surface text-slate transition hover:border-river hover:text-ink"
            :aria-label="toggleLabel"
            :title="toggleLabel"
            data-testid="theme-toggle"
            @click="toggleTheme"
          >
            <PhSun v-if="isDark" :size="19" aria-hidden="true" />
            <PhMoon v-else :size="19" aria-hidden="true" />
          </button>

          <div class="relative min-w-0">
            <button
              v-if="receipt"
              type="button"
              class="focus-ring flex h-11 min-w-0 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-medium hover:border-river"
              :aria-label="`Disconnect wallet ${walletIdentityTitle}`"
              @click="disconnect"
            >
              <PhUser :size="18" aria-hidden="true" />
              <span
                class="max-w-28 truncate sm:max-w-48"
                :title="walletIdentityTitle"
                >{{ walletIdentityLabel }}</span
              >
              <span
                class="h-2 w-2 rounded-full bg-moss"
                aria-hidden="true"
              ></span>
              <span class="hidden text-slate sm:inline">Disconnect</span>
            </button>
            <button
              v-else-if="isScanning && account"
              type="button"
              class="flex h-11 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-slate"
              aria-label="Resolving wallet name"
              disabled
            >
              <PhUser :size="18" aria-hidden="true" />
              <span>Checking name…</span>
            </button>
            <button
              v-else
              type="button"
              class="focus-ring flex h-11 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-semibold hover:border-river"
              :aria-expanded="
                announcedProviders.length > 1 ? showWalletMenu : undefined
              "
              @click="connectFromHeader"
            >
              <PhWallet :size="18" aria-hidden="true" />
              Connect wallet
            </button>
            <div
              v-if="!receipt && showWalletMenu && announcedProviders.length > 1"
              class="absolute right-0 top-12 z-40 w-64 overflow-hidden rounded-xl border border-line bg-surface p-2 shadow-panel"
            >
              <button
                v-for="wallet in announcedProviders"
                :key="wallet.descriptor.uuid"
                type="button"
                class="focus-ring flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold hover:bg-mist"
                @click="connectFromMenu(wallet)"
              >
                <img
                  v-if="wallet.descriptor.icon"
                  :src="wallet.descriptor.icon"
                  alt=""
                  class="h-6 w-6 rounded"
                />
                <PhWallet v-else :size="18" aria-hidden="true" />
                <span class="truncate">{{ wallet.descriptor.name }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>

    <section
      v-if="isScanning"
      class="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl place-items-center px-4 py-16"
      aria-live="polite"
    >
      <div class="mx-auto max-w-xl text-center">
        <div
          class="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-line border-t-river"
        ></div>
        <h1 class="mt-6 text-2xl font-semibold">Checking your wallet</h1>
        <p class="mt-2 text-sm leading-6 text-slate">
          {{ progress?.message ?? "Waiting for your wallet…" }}
        </p>
        <p class="mt-3 text-xs text-slate">
          Read-only. No signature or transaction will be requested.
        </p>
      </div>
    </section>

    <section
      v-else-if="!receipt"
      class="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl place-items-center px-4 py-16"
    >
      <div id="wallet-options" class="w-full max-w-3xl text-center">
        <p class="text-sm font-bold uppercase tracking-[0.18em] text-river">
          Borrow with your onchain assets
        </p>
        <h1 class="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">
          See what your wallet can unlock.
        </h1>
        <p
          class="mx-auto mt-5 max-w-xl text-base leading-7 text-slate sm:text-lg"
        >
          Connect a wallet to see usable collateral, compare borrowing paths,
          and review risk before you borrow.
        </p>

        <div
          v-if="announcedProviders.length"
          class="mx-auto mt-9 flex max-w-2xl flex-wrap justify-center gap-3"
        >
          <button
            v-for="wallet in announcedProviders"
            :key="wallet.descriptor.uuid"
            type="button"
            class="focus-ring inline-flex h-12 items-center justify-center gap-3 rounded-lg bg-river px-6 text-sm font-semibold text-accent-contrast hover:bg-river/90"
            @click="connect(wallet)"
          >
            <img
              v-if="wallet.descriptor.icon"
              :src="wallet.descriptor.icon"
              alt=""
              class="h-6 w-6 rounded"
            />
            <PhWallet v-else :size="20" aria-hidden="true" />
            Connect
            {{
              announcedProviders.length > 1 ? wallet.descriptor.name : "wallet"
            }}
          </button>
        </div>
        <p v-else-if="!walletDiscoveryComplete" class="mt-9 text-sm text-slate">
          Looking for a browser wallet…
        </p>
        <div
          v-else
          class="mx-auto mt-9 max-w-xl rounded-xl border border-line bg-surface p-5"
        >
          <p class="font-semibold">No browser wallet found</p>
          <p class="mt-1 text-sm text-slate">
            Install an injected wallet or open Powerrr inside your wallet
            browser.
          </p>
        </div>

        <div
          class="relative mx-auto mt-3 max-w-lg text-xs text-slate"
          @keydown.escape="showWalletReadInfo = false"
        >
          <button
            type="button"
            class="focus-ring rounded font-semibold text-river"
            aria-controls="wallet-read-info"
            :aria-expanded="showWalletReadInfo"
            @click="showWalletReadInfo = !showWalletReadInfo"
          >
            How it works
          </button>
          <p
            v-if="showWalletReadInfo"
            id="wallet-read-info"
            class="absolute left-1/2 top-full z-20 mt-3 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-line bg-surface p-4 text-left leading-5 shadow-panel"
          >
            After you connect, one Multicall3 read checks 100 ERC-20 balances at
            one Ethereum block. Onchain names, prices, and provider rules are
            then read through the same wallet. Name lookup never uses an HTTP
            gateway. No signature, transaction, analytics request, or Powerrr
            API is used.
          </p>
        </div>

        <div
          v-if="error"
          class="mx-auto mt-5 flex max-w-2xl items-start gap-3 rounded-xl border border-coral/25 bg-danger-surface px-4 py-3 text-left text-sm text-danger"
          role="alert"
        >
          <PhWarningCircle
            :size="20"
            class="mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <span>{{ error }}</span>
          <button
            v-if="/Ethereum Mainnet/i.test(error)"
            type="button"
            class="focus-ring ml-auto shrink-0 font-semibold underline"
            @click="switchToMainnet"
          >
            Switch network
          </button>
        </div>
      </div>
    </section>

    <div
      v-else
      class="mx-auto w-full max-w-[1360px] px-4 py-7 sm:px-6 lg:px-8 lg:py-10"
    >
      <EstimatorResultSummary
        :demo="false"
        :address="compactAccount"
        :names="resolvedWalletNames"
        :matched-collateral="formatUsdValue(matchedCollateralUsd)"
        :asset-count="valuedAssets.length + manualReviewAssets.length"
        :selected-asset-count="selectedCollateralTokens.length"
        :provider-count="providerPathCount"
        stale-label=""
        :refreshing="isScanning"
        :refresh-complete="false"
        @refresh="refreshEstimate"
      />

      <nav
        aria-label="Estimator steps"
        class="compact-progress mb-5 mt-4 grid grid-cols-3 gap-2"
      >
        <button
          type="button"
          class="compact-step text-left"
          :class="
            currentStage === 'assets'
              ? 'compact-step-active'
              : 'compact-step-complete'
          "
          :aria-current="currentStage === 'assets' ? 'step' : undefined"
          @click="goToStage('assets')"
        >
          <span class="progress-number">
            <PhCheck
              v-if="currentStage !== 'assets'"
              :size="15"
              weight="bold"
              aria-hidden="true"
            />
            <template v-else>1</template>
          </span>
          <span><strong>Assets</strong><small>Choose collateral</small></span>
        </button>
        <button
          type="button"
          class="compact-step text-left"
          :class="
            currentStage === 'terms'
              ? 'compact-step-active'
              : currentStage === 'options'
                ? 'compact-step-complete'
                : ''
          "
          :aria-current="currentStage === 'terms' ? 'step' : undefined"
          @click="goToStage('terms')"
        >
          <span class="progress-number">
            <PhCheck
              v-if="currentStage === 'options'"
              :size="15"
              weight="bold"
              aria-hidden="true"
            />
            <template v-else>2</template>
          </span>
          <span><strong>Amount</strong><small>Set borrowing need</small></span>
        </button>
        <button
          type="button"
          class="compact-step text-left"
          :class="currentStage === 'options' ? 'compact-step-active' : ''"
          :aria-current="currentStage === 'options' ? 'step' : undefined"
          @click="goToStage('options')"
        >
          <span class="progress-number">3</span>
          <span><strong>Options</strong><small>Compare paths</small></span>
        </button>
      </nav>

      <p
        v-if="error || stageError"
        class="mb-4 flex items-start gap-3 rounded-xl border border-coral/25 bg-danger-surface px-4 py-3 text-sm text-danger"
        role="alert"
      >
        <PhWarningCircle :size="20" class="shrink-0" aria-hidden="true" />
        {{ stageError || error }}
      </p>

      <div id="workflow" class="scroll-mt-28">
        <template v-if="currentStage === 'assets'">
          <EstimatorAssets
            :assets="valuedAssets"
            :selected-tokens="selectedCollateralTokens"
            :loading="isComparing"
            @change-address="disconnect"
            @toggle="setAssetSelected"
            @continue="continueFromAssets"
          />

          <details
            v-if="manualReviewAssets.length || failedAssets.length"
            class="panel mt-4 overflow-hidden"
          >
            <summary
              class="focus-ring cursor-pointer px-5 py-4 text-sm font-semibold sm:px-6"
            >
              {{ manualReviewAssets.length }} additional asset{{
                manualReviewAssets.length === 1 ? "" : "s"
              }}
              need manual valuation
              <template v-if="failedAssets.length">
                · {{ failedAssets.length }} reads failed</template
              >
            </summary>
            <div
              class="border-t border-line px-5 py-4 text-sm text-slate sm:px-6"
            >
              <p
                v-for="asset in manualReviewAssets"
                :key="asset.token"
                class="py-1"
              >
                <strong class="text-ink">{{ asset.symbol }}</strong> ·
                {{ asset.balance }} — {{ asset.valuationReason }}
              </p>
              <p v-for="asset in failedAssets" :key="asset.token" class="py-1">
                <strong class="text-ink">{{ asset.symbol }}</strong> —
                {{ asset.balanceReadReason }}
              </p>
            </div>
          </details>
        </template>

        <EstimatorTerms
          v-else-if="currentStage === 'terms'"
          v-model:amount="borrowAmountUsd"
          :provider-maximum-usd="providerMaximumUsd"
          :own-potential-usd="ownPotentialUsd"
          :error="stageError"
          @back="goToStage('assets')"
          @continue="continueFromTerms"
        />

        <section
          v-else
          class="panel overflow-hidden"
          aria-labelledby="providers-title"
        >
          <div class="border-b border-line px-5 py-5 sm:px-6">
            <p class="text-xs font-bold uppercase tracking-[0.14em] text-river">
              Step 3 of 3
            </p>
            <h2 id="providers-title" class="mt-1 text-xl font-semibold">
              Choose a borrowing path
            </h2>
            <p class="mt-1 text-sm text-slate">
              Compare each path with your requested
              {{ formatUsdValue(borrowAmountUsd) }}.
            </p>
          </div>

          <div class="p-5 sm:p-6">
            <div
              v-if="!matchingProviderItems.length"
              class="mb-4 rounded-xl border border-warning-border bg-warning-surface p-4 text-sm text-warning"
            >
              No immediately available provider supports this amount.
              <span v-if="ownPotentialUsd < borrowAmountUsd">
                Go back and lower the amount or change collateral.
              </span>
            </div>

            <div
              class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
              role="radiogroup"
              aria-label="Immediately available providers"
            >
              <ExternalProviderOption
                v-for="provider in providerItems"
                :key="provider.id"
                :provider="provider"
                :selected="selectedProviderId === provider.id"
                :meets-amount="
                  providerCapacity(provider) >= borrowAmountUsd &&
                  providerCapacity(provider) > 0
                "
                @select="selectProvider"
              />
            </div>

            <OwnOpportunityCard
              v-if="ownOpportunity"
              :opportunity="ownOpportunity"
            />

            <section
              v-if="selectedProviderId && selectedCapacity > 0"
              class="mt-4 rounded-xl border border-line bg-surface p-4 sm:p-5"
              aria-labelledby="adjust-amount-title"
            >
              <div
                class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"
              >
                <div>
                  <h3 id="adjust-amount-title" class="font-semibold">
                    Adjust amount
                  </h3>
                  <p class="mt-1 text-xs text-slate">
                    Changes update the risk preview for this path.
                  </p>
                </div>
                <p class="text-sm tabular-nums text-slate">
                  <strong class="text-lg text-ink">{{
                    formatUsdValue(borrowAmountUsd)
                  }}</strong>
                  of {{ formatUsdValue(selectedCapacity) }}
                </p>
              </div>
              <input
                :value="borrowAmountUsd"
                type="range"
                min="0"
                :max="selectedCapacity"
                :step="amountInputStep(selectedCapacity)"
                class="amount-range mt-5 w-full"
                :class="{ 'amount-range-own': selectedProviderId === 'own' }"
                :style="{
                  '--range-progress': `${utilizationPercent}%`,
                }"
                aria-label="Borrow amount"
                :aria-valuetext="`${formatUsdValue(borrowAmountUsd)} of ${formatUsdValue(selectedCapacity)}`"
                @input="onSelectedAmountInput"
              />
              <div class="mt-2 flex justify-between text-xs text-slate">
                <span>$0</span>
                <span>{{ formatUsdValue(selectedCapacity) }} max</span>
              </div>
              <div class="mt-4 grid grid-cols-4 gap-2">
                <button
                  v-for="percent in [25, 50, 75, 100]"
                  :key="percent"
                  type="button"
                  class="focus-ring min-h-10 rounded-lg border px-2 text-xs font-semibold"
                  :class="
                    Math.abs(utilizationPercent - percent) < 1
                      ? 'border-river bg-info-surface text-river'
                      : 'border-line hover:border-river'
                  "
                  @click="setSelectedUtilization(percent)"
                >
                  {{ percent }}%
                </button>
              </div>
            </section>

            <EstimatorRiskPanel
              v-if="selectedProviderId && selectedCapacity > 0"
              :amount-usd="borrowAmountUsd"
              :maximum-usd="selectedCapacity"
              :selected-provider-id="selectedProviderId"
              :risk-title="selectedRiskTitle"
              :risk-description="selectedRiskDescription"
              own-funding-class="bg-surface text-own ring-1 ring-own/15"
              :own-funding-label="ownFundingLabel"
              :own-opportunity="ownOpportunity"
              :pooled-preview="pooledPreview"
              :pooled-rate-label="pooledRateLabel"
              :announcement="riskAnnouncement"
            />

            <div
              v-if="selectedProviderId"
              class="mt-4 flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <p class="text-sm text-slate">
                Review {{ formatUsdValue(borrowAmountUsd) }} USDC with
                <strong class="text-ink">{{
                  selectedProviderId === "own" ? "OWN" : selectedProvider?.label
                }}</strong
                >.
              </p>
              <a
                v-if="selectedProviderId === 'own'"
                href="https://own.casa/borrow#contact"
                target="_blank"
                rel="noopener noreferrer"
                class="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-river px-6 text-sm font-semibold text-accent-contrast"
              >
                Request with OWN
                <PhArrowSquareOut :size="17" aria-hidden="true" />
              </a>
              <button
                v-else
                type="button"
                class="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-river px-6 text-sm font-semibold text-accent-contrast"
                :class="{
                  'cursor-not-allowed opacity-50': !pooledPreview?.actionable,
                }"
                :disabled="!pooledPreview?.actionable"
                @click="continueWithSelection"
              >
                Review on {{ selectedProvider?.label }}
                <PhArrowSquareOut :size="17" aria-hidden="true" />
              </button>
            </div>

            <button
              type="button"
              class="focus-ring mt-5 min-h-11 rounded-lg px-3 text-sm font-semibold text-river hover:bg-info-surface"
              @click="goToStage('terms')"
            >
              Back to amount
            </button>
          </div>
        </section>
      </div>

      <details class="panel mt-5 overflow-hidden">
        <summary
          class="focus-ring flex min-h-14 cursor-pointer items-center gap-2 px-5 py-4 text-sm font-semibold sm:px-6"
        >
          <PhInfo :size="18" aria-hidden="true" />
          How this was calculated
          <PhCaretDown :size="14" class="ml-auto" aria-hidden="true" />
        </summary>
        <div
          class="grid gap-5 border-t border-line px-5 py-5 text-sm sm:grid-cols-2 sm:px-6 lg:grid-cols-4"
        >
          <div>
            <p class="text-slate">Wallet</p>
            <p class="mt-1 font-semibold">
              {{ receipt.walletName }} · {{ walletIdentityTitle }}
            </p>
          </div>
          <div>
            <p class="text-slate">Ethereum block</p>
            <p class="mt-1 font-semibold">
              {{ receipt.blockNumber }} ·
              <time :datetime="receipt.blockTimestamp">
                Loaded {{ blockLoadedAtLabel }}
              </time>
            </p>
          </div>
          <div>
            <p class="text-slate">Balance calls</p>
            <p class="mt-1 font-semibold">
              {{ receipt.callsSucceeded }}/{{ receipt.callsAttempted }}
              succeeded
            </p>
          </div>
          <div>
            <p class="text-slate">Privacy</p>
            <p class="mt-1 font-semibold text-moss">
              No account, balance, or request was posted to Powerrr.
            </p>
          </div>
        </div>
      </details>
    </div>
  </main>
</template>
