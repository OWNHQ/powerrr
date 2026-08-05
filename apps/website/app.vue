<script setup lang="ts">
import {
  PhCaretDown,
  PhCheck,
  PhInfo,
  PhUser,
  PhWallet,
  PhWarningCircle,
} from "@phosphor-icons/vue";
import { ETHEREUM_TOKEN_REGISTRY_TOTAL_COUNT } from "@powerrr/configs";
import { decimalStringToRaw, USDC_DECIMALS } from "@powerrr/math";
import {
  amountForTargetLtv,
  formatUsdValue,
  summarizeCollateralCoverage,
  summarizeEstimatorCapacity,
} from "./utils/estimator-ux";
import {
  pooledBorrowAvailableRaw,
  pooledBorrowAvailableUsd,
} from "./utils/borrow-preview";
import { formatLocalDateTime } from "./utils/date-time";
import {
  groupWebsiteQuoteRows,
  type WebsiteQuoteGroup,
} from "./utils/quote-row";

type EstimatorStage = "assets" | "comparison";
type ProviderItem = {
  id: "aave" | "sparklend" | "compound-iii" | "morpho-blue";
  statusId: "aave-v3" | "sparklend" | "compound-iii" | "morpho-blue";
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
  assets,
  selectedAssets,
  selectedCollateralTokens,
  receipt,
  registrySource,
  quotes,
  providerStatuses,
  error,
  isScanning,
  isRefreshing,
  isComparing,
  walletDiscoveryComplete,
  connect,
  refresh,
  switchToMainnet,
  disconnect,
  setAssetSelected,
  compareSelectedAssets,
} = useStaticEstimator();

const currentStage = ref<EstimatorStage>("assets");
const expandedProviderId = ref("");
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
  {
    id: "aave",
    statusId: "aave-v3",
    label: "Aave",
    link: "https://app.aave.com/?marketName=proto_mainnet_v3",
  },
  {
    id: "sparklend",
    statusId: "sparklend",
    label: "Spark",
    link: "https://app.spark.fi/markets/?marketName=proto_spark_v3",
  },
  {
    id: "morpho-blue",
    statusId: "morpho-blue",
    label: "Morpho",
    link: "https://app.morpho.org/ethereum/variable/0x94b823e6bd8ea533b4e33fbc307faea0b307301bc48763acc4d4aa4def7636cd/weth-usdc",
  },
  {
    id: "compound-iii",
    statusId: "compound-iii",
    label: "Compound",
    link: "https://app.compound.finance/markets/usdc-mainnet",
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
    .sort((left, right) => {
      const leftRaw = providerCapacityRaw(left);
      const rightRaw = providerCapacityRaw(right);
      return rightRaw < leftRaw ? -1 : rightRaw > leftRaw ? 1 : 0;
    }),
);
const capacitySummary = computed(() =>
  summarizeEstimatorCapacity(
    providerItems.value.map((provider) => providerCapacity(provider)),
  ),
);
const providerMaximumUsd = computed(
  () => capacitySummary.value.providerMaximumUsd,
);
const providerPathCount = computed(
  () =>
    providerItems.value.filter((provider) => providerCapacityRaw(provider) > 0n)
      .length,
);
const ltvReferenceProvider = computed(() =>
  providerItems.value.find(
    (provider) =>
      providerCapacity(provider) > 0 &&
      providerStatus(provider)?.status !== "unavailable" &&
      provider.group?.primaryQuote.collateralUsed.some(
        (collateral) => collateral.valueUsd > 0,
      ),
  ),
);
const ltvReferenceQuote = computed(
  () => ltvReferenceProvider.value?.group?.primaryQuote,
);
const ltvReferenceCollateralUsd = computed(
  () =>
    ltvReferenceQuote.value?.collateralUsed.reduce(
      (sum, collateral) => sum + collateral.valueUsd,
      0,
    ) ?? 0,
);
const ltvReferenceExistingDebtUsd = computed(() =>
  ltvReferenceQuote.value?.mode === "existing-position"
    ? Math.max(0, ltvReferenceQuote.value.existingDebtUsd ?? 0)
    : 0,
);
const coveringProviderCount = computed(() => {
  const requestedRaw = decimalStringToRaw(
    Math.max(0, borrowAmountUsd.value).toFixed(USDC_DECIMALS),
    USDC_DECIMALS,
  );
  return providerItems.value.filter(
    (provider) =>
      providerCapacityRaw(provider) > 0n &&
      requestedRaw <= providerCapacityRaw(provider),
  ).length;
});
const scanProgressPercent = computed(() => {
  if (!progress.value) return 8;
  const ratio =
    progress.value.total > 0
      ? Math.min(1, progress.value.completed / progress.value.total)
      : 0;
  const phases = {
    connecting: [8, 14],
    balances: [15, 52],
    valuation: [53, 78],
    providers: [79, 96],
    complete: [100, 100],
  } as const;
  const [start, end] = phases[progress.value.phase];
  return Math.round(start + (end - start) * ratio);
});
const matchedCollateralUsd = computed(() =>
  selectedAssets.value.reduce(
    (sum, asset) => sum + Number(asset.balance) * (asset.marketPriceUsd ?? 0),
    0,
  ),
);
const comparisonCeilingUsd = computed(() =>
  Math.max(providerMaximumUsd.value, matchedCollateralUsd.value, 1),
);
const positiveAssets = computed(() =>
  assets.value.filter(
    (asset) =>
      asset.balanceReadStatus === "success" && Number(asset.balance) > 0,
  ),
);
const collateralCoverage = computed(() =>
  summarizeCollateralCoverage(
    selectedAssets.value,
    quotes.value,
    providerStatuses.value,
  ),
);

watch(receipt, (next, previous) => {
  if (!next || previous) return;
  currentStage.value = "assets";
  expandedProviderId.value = "";
  borrowAmountUsd.value = 0;
  stageError.value = "";
});

async function enterComparison(): Promise<void> {
  if (!selectedCollateralTokens.value.length) {
    stageError.value = "Select at least one collateral asset to continue.";
    return;
  }
  stageError.value = "";
  await compareSelectedAssets();
  if (error.value) return;
  currentStage.value = "comparison";
  expandedProviderId.value = "";
  if (borrowAmountUsd.value <= 0) {
    borrowAmountUsd.value = amountForTargetLtv(
      ltvReferenceCollateralUsd.value,
      ltvReferenceExistingDebtUsd.value,
      50,
    );
  }
}

async function continueFromAssets(): Promise<void> {
  await enterComparison();
}

async function goToStage(stage: EstimatorStage): Promise<void> {
  if (stage === "comparison" && !selectedCollateralTokens.value.length) return;
  if (stage === "comparison") {
    await enterComparison();
    return;
  }
  currentStage.value = stage;
  stageError.value = "";
}

function toggleProvider(id: string): void {
  expandedProviderId.value = expandedProviderId.value === id ? "" : id;
}

async function refreshEstimate(): Promise<void> {
  await refresh();
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
  return provider.group
    ? pooledBorrowAvailableUsd(provider.group.primaryQuote)
    : 0;
}

function providerCapacityRaw(provider: ProviderItem): bigint {
  return provider.group
    ? pooledBorrowAvailableRaw(provider.group.primaryQuote)
    : 0n;
}

function providerStatus(provider: ProviderItem) {
  return providerStatuses.value.find(
    (status) => status.protocolId === provider.statusId,
  );
}
</script>

<template>
  <a href="#main-content" class="skip-link">Skip to estimator</a>
  <main id="main-content" class="flex min-h-screen flex-col bg-paper text-ink">
    <header
      class="sticky top-0 z-30 border-b border-line/80 bg-surface/95 backdrop-blur"
    >
      <div
        class="mx-auto flex h-16 w-full max-w-[1360px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"
      >
        <a href="/" class="type-wordmark focus-ring rounded-md"> Powerrr </a>
        <div class="flex min-w-0 items-center gap-2">
          <div class="relative min-w-0">
            <Transition name="wallet-control" mode="out-in">
              <button
                v-if="receipt"
                key="connected"
                type="button"
                class="focus-ring flex h-11 min-w-0 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-medium hover:border-river"
                :aria-label="`Disconnect wallet ${walletIdentityTitle}`"
                @click="disconnect"
              >
                <PhUser :size="18" aria-hidden="true" />
                <span
                  class="max-w-20 truncate sm:max-w-48"
                  :title="walletIdentityTitle"
                  >{{ walletIdentityLabel }}</span
                >
                <span
                  class="h-2 w-2 rounded-full bg-moss"
                  aria-hidden="true"
                ></span>
                <span class="text-slate">Disconnect</span>
              </button>
              <button
                v-else-if="isScanning && account"
                key="resolving"
                type="button"
                class="flex h-11 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-slate"
                aria-label="Resolving wallet name"
                disabled
              >
                <PhUser :size="18" aria-hidden="true" />
                <span>Checking name…</span>
              </button>
              <button
                v-else-if="
                  !walletDiscoveryComplete || announcedProviders.length > 0
                "
                key="connect"
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
            </Transition>
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

    <Transition name="instrument-state" mode="out-in" appear>
      <section
        v-if="isScanning"
        key="scanning"
        class="mx-auto grid w-full flex-1 place-items-center px-4 py-16"
        aria-live="polite"
      >
        <div class="mx-auto max-w-xl text-center">
          <div class="scan-dial mx-auto" aria-hidden="true">
            <span class="scan-dial-track"></span>
            <span class="scan-dial-sweep"></span>
            <span class="scan-dial-core"><PhWallet :size="22" /></span>
          </div>
          <h1 class="type-headline mt-6">Checking your wallet</h1>
          <Transition name="scan-reading" mode="out-in">
            <p
              :key="`${progress?.phase ?? 'waiting'}-${progress?.message ?? ''}`"
              class="mt-2 text-sm leading-6 text-slate"
            >
              {{ progress?.message ?? "Waiting for your wallet…" }}
            </p>
          </Transition>
          <div
            class="mx-auto mt-5 h-1.5 max-w-sm overflow-hidden rounded-full bg-line/55"
            role="progressbar"
            aria-label="Wallet scan progress"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="scanProgressPercent"
          >
            <div
              class="scan-progress-bar h-full w-full origin-left rounded-full bg-river"
              :style="{ transform: `scaleX(${scanProgressPercent / 100})` }"
            ></div>
          </div>
          <p class="mt-3 text-xs tabular-nums text-slate">
            {{ scanProgressPercent }}% · Read-only. No signature or transaction.
          </p>
        </div>
      </section>

      <section
        v-else-if="!receipt"
        key="landing"
        class="mx-auto grid w-full max-w-6xl flex-1 place-items-center px-4 py-16"
      >
        <div id="wallet-options" class="w-full max-w-3xl text-center">
          <h1 class="type-display landing-display-balanced mx-auto max-w-none">
            <span class="block whitespace-nowrap">See what your</span>
            <span class="block whitespace-nowrap">wallet can unlock.</span>
          </h1>
          <p
            class="type-body mx-auto mt-6 max-w-xl text-slate sm:text-lg sm:leading-8"
          >
            Connect a wallet to see usable collateral, compare borrowing paths,
            and review risk before you borrow.
          </p>

          <ul
            class="mx-auto mt-5 flex max-w-2xl flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-slate"
            aria-label="Wallet scan safeguards"
          >
            <li class="inline-flex items-center gap-1.5">
              <PhCheck :size="16" weight="bold" class="text-moss" /> Read-only
              connection
            </li>
            <li class="inline-flex items-center gap-1.5">
              <PhCheck :size="16" weight="bold" class="text-moss" /> No
              signature or transaction
            </li>
            <li class="inline-flex items-center gap-1.5">
              <PhCheck :size="16" weight="bold" class="text-moss" /> One-block
              snapshot
            </li>
          </ul>

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
                announcedProviders.length > 1
                  ? wallet.descriptor.name
                  : "wallet"
              }}
            </button>
          </div>
          <p
            v-else-if="!walletDiscoveryComplete"
            class="mt-9 text-sm text-slate"
          >
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
              After you connect, a chunked Multicall3 read checks the reviewed
              {{ ETHEREUM_TOKEN_REGISTRY_TOTAL_COUNT }}-token Ethereum registry
              at one block. Onchain names, prices, and provider rules are then
              read through the same wallet. Name lookup never uses an HTTP
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
        key="workspace"
        class="mx-auto w-full max-w-[1360px] flex-1 px-4 py-7 sm:px-6 lg:px-8 lg:py-10"
      >
        <EstimatorResultSummary
          :demo="false"
          :address="compactAccount"
          :names="resolvedWalletNames"
          :matched-collateral="formatUsdValue(matchedCollateralUsd)"
          :asset-count="positiveAssets.length"
          :selected-asset-count="selectedCollateralTokens.length"
          :provider-count="providerPathCount"
          stale-label=""
          :refreshing="isRefreshing"
          :refresh-complete="false"
          @refresh="refreshEstimate"
        />

        <nav
          aria-label="Estimator steps"
          class="compact-progress mb-5 mt-4 grid grid-cols-2 gap-2"
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
            :class="currentStage === 'comparison' ? 'compact-step-active' : ''"
            :aria-current="currentStage === 'comparison' ? 'step' : undefined"
            :disabled="!selectedCollateralTokens.length || isComparing"
            @click="goToStage('comparison')"
          >
            <span class="progress-number">2</span>
            <span
              ><strong>Compare</strong
              ><small>Amount, terms, and risk</small></span
            >
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

        <div id="workflow" class="scroll-mt-28 overflow-x-clip">
          <Transition name="workflow-stage" mode="out-in">
            <div v-if="currentStage === 'assets'" key="assets">
              <EstimatorAssets
                :assets="positiveAssets"
                :selected-tokens="selectedCollateralTokens"
                :loading="isComparing"
                @change-address="disconnect"
                @toggle="setAssetSelected"
                @continue="continueFromAssets"
              />
            </div>

            <div
              v-else
              key="comparison"
              class="grid gap-4 xl:grid-cols-[20rem_minmax(0,1fr)] xl:items-start"
            >
              <div class="xl:sticky xl:top-24" data-comparison-control>
                <EstimatorTerms
                  v-model:amount="borrowAmountUsd"
                  :comparison-ceiling-usd="comparisonCeilingUsd"
                  :provider-maximum-usd="providerMaximumUsd"
                  :selected-asset-value-usd="matchedCollateralUsd"
                  :ltv-reference-provider="ltvReferenceProvider?.label ?? ''"
                  :ltv-reference-collateral-usd="ltvReferenceCollateralUsd"
                  :ltv-reference-existing-debt-usd="ltvReferenceExistingDebtUsd"
                  :error="stageError"
                  @back="goToStage('assets')"
                />
              </div>

              <section data-provider-field aria-labelledby="providers-title">
                <div
                  class="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"
                >
                  <div>
                    <h2 id="providers-title" class="type-subtitle">
                      Borrowing paths
                    </h2>
                    <p class="text-sm text-slate">
                      Expand any path to inspect its support, constraints, and
                      risk evidence.
                    </p>
                  </div>
                  <p class="text-sm text-slate">
                    <strong class="font-semibold text-ink tabular-nums">
                      {{ coveringProviderCount }}/{{ providerItems.length }}
                    </strong>
                    pooled providers cover
                    {{ formatUsdValue(borrowAmountUsd) }}
                  </p>
                </div>

                <CollateralCoverageSummary
                  class="mb-3"
                  v-bind="collateralCoverage"
                />

                <div class="grid gap-3">
                  <ProtocolComparisonCard
                    v-for="provider in providerItems"
                    :id="provider.id"
                    :key="provider.id"
                    :label="provider.label"
                    :link="provider.link"
                    :quote="provider.group?.primaryQuote"
                    :status="providerStatus(provider)"
                    :amount-usd="borrowAmountUsd"
                    :assets="positiveAssets"
                    :expanded="expandedProviderId === provider.id"
                    @toggle="toggleProvider"
                  />
                </div>
              </section>
            </div>
          </Transition>
        </div>

        <details
          class="panel mt-5 overflow-hidden"
          :class="
            currentStage === 'assets'
              ? 'lg:w-[calc(100%-19rem)] xl:w-[calc(100%-21rem)]'
              : ''
          "
        >
          <summary
            class="focus-ring flex min-h-14 cursor-pointer items-center gap-2 px-5 py-4 text-sm font-semibold sm:px-6"
          >
            <PhInfo :size="18" aria-hidden="true" />
            About this estimate
            <PhCaretDown :size="14" class="ml-auto" aria-hidden="true" />
          </summary>
          <div
            class="grid gap-5 border-t border-line px-5 py-5 text-sm sm:grid-cols-2 sm:px-6 lg:grid-cols-5"
          >
            <div class="min-w-0">
              <p class="text-slate">Wallet</p>
              <p
                class="mt-1 truncate whitespace-nowrap font-semibold"
                :title="`${receipt.walletName} · ${walletIdentityTitle}`"
              >
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
              <p class="text-slate">Asset registry</p>
              <p class="mt-1 font-semibold" :title="registrySource">
                {{ receipt.registryVersion }}
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
    </Transition>

    <p
      class="mt-auto flex items-center gap-2 self-end px-4 pb-4 pt-8 text-xs text-slate sm:px-6 lg:px-8"
    >
      <span>built by</span>
      <a
        href="https://own.casa"
        target="_blank"
        rel="noopener noreferrer"
        class="focus-ring inline-flex min-h-8 items-center rounded-md px-1 opacity-80 transition-opacity hover:opacity-100"
        aria-label="OWN"
      >
        <img
          src="/brands/own.svg"
          alt=""
          class="h-3.5 w-auto"
          aria-hidden="true"
        />
      </a>
    </p>
  </main>
</template>
