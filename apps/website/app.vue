<script setup lang="ts">
import {
  PhArrowDown,
  PhArrowUp,
  PhArrowsDownUp,
  PhCheck,
  PhUser,
  PhWallet,
  PhWarningCircle,
} from "@phosphor-icons/vue";
import { ETHEREUM_TOKEN_REGISTRY_TOTAL_COUNT } from "@powerrr/configs";
import { rawAmount, USDC_DECIMALS } from "@powerrr/math";
import type { RawAmount } from "@powerrr/shared-types";
import {
  compareMarketSortValues,
  formatUsdValue,
  providerBorrowApr,
  summarizeCollateralCoverage,
  type MarketSortDirection,
  weightedRouteBorrowApr,
} from "./utils/estimator-ux";
import {
  calculatePooledBorrowPreview,
  pooledBorrowAvailableRaw,
  pooledBorrowAvailableUsd,
} from "./utils/borrow-preview";
import { formatLocalDateTime } from "./utils/date-time";
import {
  groupWebsiteQuoteRows,
  type WebsiteQuoteGroup,
} from "./utils/quote-row";
import {
  providerDestination,
  type ProviderDestination,
} from "./utils/provider-destination";
import WalletConnectDialog from "./components/WalletConnectDialog.vue";
import { formatWalletIdentityLabel } from "./utils/wallet-identity";
import {
  amountForBorrowIntent,
  selectedCollateralSignature,
  type BorrowAmountIntent,
} from "./utils/borrow-amount-intent";

type EstimatorStage = "assets" | "comparison";
type MarketSortKey = "apr" | "available" | "buffer";
type ProviderItem = {
  id: "aave" | "sparklend" | "compound-iii" | "morpho-blue";
  statusId: "aave-v3" | "sparklend" | "compound-iii" | "morpho-blue";
  label: string;
  destination?: ProviderDestination;
  group?: WebsiteQuoteGroup;
};

const {
  announcedProviders,
  orderedProviders,
  selectedWallet,
  rememberedWalletRdns,
  account,
  compactAccount,
  resolvedWalletNames,
  progress,
  assets,
  selectedAssets,
  selectedCollateralTokens,
  receipt,
  quotes,
  providerStatuses,
  error,
  walletNotice,
  isScanning,
  isConnecting,
  connectionSlow,
  connectionTimedOut,
  isRefreshing,
  isComparing,
  walletDiscoveryComplete,
  connect,
  cancelConnection,
  refresh,
  switchToMainnet,
  disconnect,
  setAssetSelected,
  compareSelectedAssets,
} = useStaticEstimator();

const currentStage = ref<EstimatorStage>("assets");
const expandedMarketId = ref("");
const borrowAmount = ref<RawAmount>(rawAmount(0n, USDC_DECIMALS));
const borrowAmountError = ref("");
const effectiveBorrowAmount = computed(() =>
  borrowAmountError.value ? rawAmount(0n, USDC_DECIMALS) : borrowAmount.value,
);
const borrowAmountIntent = ref<BorrowAmountIntent>({
  kind: "relative",
  utilizationPercent: 50,
});
const marketSortKey = ref<MarketSortKey>("buffer");
const marketSortDirection = ref<MarketSortDirection>("desc");
const comparedCollateralSignature = ref("");
const stageError = ref("");
const showWalletReadInfo = ref(false);
const walletDialog = ref<InstanceType<typeof WalletConnectDialog> | null>(null);
const walletIdentityLabel = computed(() =>
  formatWalletIdentityLabel(resolvedWalletNames.value, compactAccount.value),
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
  },
  {
    id: "sparklend",
    statusId: "sparklend",
    label: "Spark",
  },
  {
    id: "morpho-blue",
    statusId: "morpho-blue",
    label: "Morpho",
  },
  {
    id: "compound-iii",
    statusId: "compound-iii",
    label: "Compound",
  },
];
const marketSortColumns: Array<{
  key: MarketSortKey;
  label: string;
  defaultDirection: MarketSortDirection;
}> = [
  { key: "apr", label: "APR", defaultDirection: "asc" },
  { key: "available", label: "Max borrow", defaultDirection: "desc" },
  {
    key: "buffer",
    label: "Buffer at your amount",
    defaultDirection: "desc",
  },
];

const quoteGroups = computed(() => groupWebsiteQuoteRows(quotes.value));
const unsortedProviderItems = computed<ProviderItem[]>(() =>
  providerDefinitions.map((definition) => {
    const group = quoteGroups.value.find(
      (candidate) => candidate.groupId === definition.id,
    );
    return {
      ...definition,
      group,
      destination: providerDestination(
        definition.statusId,
        group?.primaryQuote,
      ),
    };
  }),
);
const providerItems = computed<ProviderItem[]>(() =>
  [...unsortedProviderItems.value].sort((left, right) =>
    compareMarketSortValues(
      providerMarketSortValue(left),
      providerMarketSortValue(right),
      marketSortDirection.value,
    ),
  ),
);
const providerMaximumRaw = computed(() =>
  unsortedProviderItems.value.reduce((maximum, provider) => {
    const candidate = providerCapacityRaw(provider);
    return candidate > maximum ? candidate : maximum;
  }, 0n),
);
const comparisonCeiling = computed(() =>
  rawAmount(providerMaximumRaw.value, USDC_DECIMALS),
);
const providerPathCount = computed(
  () =>
    providerItems.value.filter((provider) => providerCapacityRaw(provider) > 0n)
      .length,
);
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
  expandedMarketId.value = "";
  borrowAmount.value = rawAmount(0n, USDC_DECIMALS);
  borrowAmountError.value = "";
  borrowAmountIntent.value = { kind: "relative", utilizationPercent: 50 };
  comparedCollateralSignature.value = "";
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
  const nextSignature = selectedCollateralSignature(
    selectedCollateralTokens.value,
  );
  if (nextSignature !== comparedCollateralSignature.value) {
    borrowAmount.value = amountForBorrowIntent(
      borrowAmountIntent.value,
      comparisonCeiling.value,
      borrowAmount.value,
    );
  }
  comparedCollateralSignature.value = nextSignature;
  currentStage.value = "comparison";
  expandedMarketId.value = "";
}

function setBorrowAmountIntent(intent: BorrowAmountIntent): void {
  borrowAmountIntent.value = intent;
}

function setBorrowAmountError(message: string): void {
  borrowAmountError.value = message;
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

function toggleMarket(id: string): void {
  expandedMarketId.value = expandedMarketId.value === id ? "" : id;
}

async function refreshEstimate(): Promise<void> {
  await refresh();
}

function openWalletDialog(trigger?: EventTarget | null): void {
  walletDialog.value?.open(trigger instanceof HTMLElement ? trigger : null);
}

function connectFromMenu(
  wallet: (typeof announcedProviders.value)[number],
): void {
  void connect(wallet);
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

function providerPreview(provider: ProviderItem) {
  return provider.group
    ? calculatePooledBorrowPreview(
        provider.group.primaryQuote,
        effectiveBorrowAmount.value,
      )
    : null;
}

function providerMarketSortValue(provider: ProviderItem) {
  const status = providerStatus(provider);
  const preview = providerPreview(provider);
  const quote = provider.group?.primaryQuote;
  let value: number | null = null;
  if (quote && marketSortKey.value === "apr") {
    value = preview?.isolatedRoute?.legs.length
      ? weightedRouteBorrowApr(preview.isolatedRoute.legs)
      : providerBorrowApr(quote);
  } else if (quote && marketSortKey.value === "available") {
    value = pooledBorrowAvailableUsd(quote);
  } else if (marketSortKey.value === "buffer") {
    value = preview?.healthFactor ?? null;
  }
  return {
    isAvailable:
      status?.status !== "unavailable" && preview?.actionable === true,
    value,
    originalIndex: providerDefinitions.findIndex(
      (definition) => definition.id === provider.id,
    ),
  };
}

function setMarketSort(column: (typeof marketSortColumns)[number]): void {
  if (marketSortKey.value === column.key) {
    marketSortDirection.value =
      marketSortDirection.value === "asc" ? "desc" : "asc";
    return;
  }
  marketSortKey.value = column.key;
  marketSortDirection.value = column.defaultDirection;
}

function marketSortAriaLabel(
  column: (typeof marketSortColumns)[number],
): string {
  if (marketSortKey.value !== column.key) {
    return `Sort by ${column.label}, ${column.defaultDirection === "asc" ? "lowest first" : "highest first"}`;
  }
  return `Sorted by ${column.label}, ${marketSortDirection.value === "asc" ? "lowest first" : "highest first"}. Activate to reverse`;
}
</script>

<template>
  <a href="#main-content" class="skip-link">Skip to estimator</a>
  <main
    id="main-content"
    class="flex min-h-screen flex-col bg-paper text-ink"
    data-clarity-mask
  >
    <header
      class="sticky top-0 z-30 border-b border-line/80 bg-surface/95 backdrop-blur"
    >
      <div
        class="mx-auto flex h-16 w-full max-w-[1360px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"
      >
        <span class="type-wordmark">Powerrr</span>
        <div class="flex min-w-0 items-center gap-2">
          <div class="min-w-0">
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
                  class="flex max-w-24 min-w-0 flex-col text-left leading-tight sm:max-w-48"
                  :title="walletIdentityTitle"
                >
                  <strong class="truncate font-semibold">{{
                    walletIdentityLabel
                  }}</strong>
                  <span
                    v-if="resolvedWalletNames.length"
                    class="truncate text-xs font-normal text-slate"
                    >{{ compactAccount }}</span
                  >
                </span>
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
                v-else
                key="connect"
                type="button"
                class="focus-ring flex h-11 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-semibold hover:border-river"
                aria-haspopup="dialog"
                @click="openWalletDialog($event.currentTarget)"
              >
                <PhWallet :size="18" aria-hidden="true" />
                Connect wallet
              </button>
            </Transition>
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
          <h1 class="type-headline mt-6">
            {{
              isConnecting && selectedWallet
                ? `Connecting to ${selectedWallet.descriptor.name}`
                : "Checking your wallet"
            }}
          </h1>
          <Transition name="scan-reading" mode="out-in">
            <p
              :key="`${progress?.phase ?? 'waiting'}-${progress?.message ?? ''}-${connectionSlow}-${connectionTimedOut}`"
              class="mt-2 text-sm leading-6 text-slate"
            >
              <template v-if="isConnecting && connectionTimedOut">
                Connection is taking too long. Cancel and choose the wallet to
                try again.
              </template>
              <template v-else-if="isConnecting && connectionSlow">
                Taking longer than expected. Make sure
                {{ selectedWallet?.descriptor.name }} is unlocked.
              </template>
              <template v-else>
                {{ progress?.message ?? "Waiting for your wallet…" }}
              </template>
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
          <button
            v-if="isConnecting || (isScanning && !receipt)"
            type="button"
            class="focus-ring mt-5 min-h-11 rounded-lg border border-line bg-surface px-5 text-sm font-semibold text-river hover:border-river"
            @click="cancelConnection"
          >
            Cancel
          </button>
        </div>
      </section>

      <section
        v-else-if="!receipt"
        key="landing"
        class="mx-auto grid w-full max-w-6xl flex-1 place-items-center px-4 py-16"
      >
        <div id="wallet-options" class="w-full max-w-3xl text-center">
          <h1 class="type-display landing-display-balanced mx-auto max-w-none">
            <span class="block whitespace-nowrap">See how much</span>
            <span class="block whitespace-nowrap">you could borrow.</span>
          </h1>
          <p
            class="type-body mx-auto mt-6 max-w-xl text-slate sm:text-lg sm:leading-8"
          >
            Connect a wallet to see your usable collateral across different
            lending markets, compare borrowing terms, and review risk.
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
              <PhCheck :size="16" weight="bold" class="text-moss" /> Ethereum
              mainnet
            </li>
          </ul>

          <div
            v-if="announcedProviders.length"
            class="mx-auto mt-9 flex max-w-2xl flex-wrap justify-center gap-3"
          >
            <button
              type="button"
              class="focus-ring inline-flex h-12 items-center justify-center gap-3 rounded-lg bg-river px-6 text-sm font-semibold text-accent-contrast hover:bg-river/90"
              aria-haspopup="dialog"
              @click="openWalletDialog($event.currentTarget)"
            >
              <PhWallet :size="20" aria-hidden="true" />
              Check my wallet
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
              Open Powerrr inside your wallet browser, or use the Connect wallet
              button to check again after installing a browser wallet.
            </p>
          </div>

          <p
            v-if="walletNotice"
            class="mx-auto mt-4 max-w-xl text-sm font-medium text-moss"
            role="status"
          >
            {{ walletNotice }}
          </p>

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
            <div
              v-if="showWalletReadInfo"
              id="wallet-read-info"
              class="absolute left-1/2 top-full z-50 mt-3 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-line bg-surface p-4 text-left leading-5 shadow-panel"
            >
              <p>
                Powerrr checks the tokens in your wallet to estimate how much
                you could borrow across supported markets. Nothing moves, you do
                not sign anything, and your balances are not sent to Powerrr.
              </p>
              <div class="mt-3 border-t border-line pt-3">
                <p class="font-semibold text-ink">Technical details</p>
                <p class="mt-2 text-slate">
                  After you connect, a chunked Multicall3 read checks the
                  reviewed {{ ETHEREUM_TOKEN_REGISTRY_TOTAL_COUNT }}-token
                  Ethereum registry at one pinned block. Onchain names, prices,
                  and market rules are read through the same wallet. Name lookup
                  never uses an HTTP gateway. No Powerrr API, signature, or
                  transaction is used.
                </p>
              </div>
            </div>
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
                :assets="assets"
                :selected-tokens="selectedCollateralTokens"
                :loading="isComparing"
                @change-address="disconnect"
                @toggle="setAssetSelected"
                @continue="continueFromAssets"
              >
                <template #after-main>
                  <EstimatorReceiptDetails
                    :wallet-name="receipt.walletName"
                    :wallet-identity-label="walletIdentityLabel"
                    :block-number="receipt.blockNumber"
                    :block-timestamp="receipt.blockTimestamp"
                    :block-loaded-at-label="blockLoadedAtLabel"
                    :calls-succeeded="receipt.callsSucceeded"
                    :calls-attempted="receipt.callsAttempted"
                  />
                </template>
              </EstimatorAssets>
            </div>

            <div
              v-else
              key="comparison"
              class="grid gap-4 xl:grid-cols-[20rem_minmax(0,1fr)] xl:items-start"
            >
              <div class="xl:sticky xl:top-24" data-comparison-control>
                <EstimatorTerms
                  v-model:amount="borrowAmount"
                  :comparison-ceiling="comparisonCeiling"
                  :error="borrowAmountError || stageError"
                  @intent-change="setBorrowAmountIntent"
                  @validation-error="setBorrowAmountError"
                  @back="goToStage('assets')"
                />
              </div>

              <section data-provider-field aria-label="Borrowing markets">
                <CollateralCoverageSummary
                  class="mb-3"
                  v-bind="collateralCoverage"
                />

                <div
                  class="mb-2 hidden grid-cols-[minmax(10rem,1.25fr)_minmax(8rem,0.8fr)_minmax(8rem,0.8fr)_minmax(16rem,1.5fr)_2.75rem] gap-4 px-5 text-xs font-semibold text-slate lg:grid"
                  role="group"
                  aria-label="Sort markets"
                >
                  <span class="flex min-h-9 items-center">Market</span>
                  <button
                    v-for="column in marketSortColumns"
                    :key="column.key"
                    type="button"
                    class="focus-ring -mx-2 inline-flex min-h-9 w-fit items-center gap-1.5 rounded-md px-2 text-left transition-colors hover:bg-mist/55 hover:text-ink"
                    :class="
                      marketSortKey === column.key ? 'text-ink' : 'text-slate'
                    "
                    :aria-label="marketSortAriaLabel(column)"
                    :aria-pressed="marketSortKey === column.key"
                    @click="setMarketSort(column)"
                  >
                    <span>{{ column.label }}</span>
                    <PhArrowUp
                      v-if="
                        marketSortKey === column.key &&
                        marketSortDirection === 'asc'
                      "
                      :size="14"
                      weight="bold"
                      aria-hidden="true"
                    />
                    <PhArrowDown
                      v-else-if="marketSortKey === column.key"
                      :size="14"
                      weight="bold"
                      aria-hidden="true"
                    />
                    <PhArrowsDownUp v-else :size="14" aria-hidden="true" />
                  </button>
                  <span></span>
                </div>

                <div
                  class="mb-3 flex items-center gap-2 overflow-x-auto pb-1 lg:hidden"
                  role="group"
                  aria-label="Sort markets"
                >
                  <span class="shrink-0 text-xs font-semibold text-slate"
                    >Sort</span
                  >
                  <button
                    v-for="column in marketSortColumns"
                    :key="column.key"
                    type="button"
                    class="focus-ring inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors"
                    :class="
                      marketSortKey === column.key
                        ? 'border-river bg-mist/55 text-ink'
                        : 'border-line bg-surface text-slate hover:border-river hover:text-ink'
                    "
                    :aria-label="marketSortAriaLabel(column)"
                    :aria-pressed="marketSortKey === column.key"
                    @click="setMarketSort(column)"
                  >
                    <span>{{ column.label }}</span>
                    <PhArrowUp
                      v-if="
                        marketSortKey === column.key &&
                        marketSortDirection === 'asc'
                      "
                      :size="14"
                      weight="bold"
                      aria-hidden="true"
                    />
                    <PhArrowDown
                      v-else-if="marketSortKey === column.key"
                      :size="14"
                      weight="bold"
                      aria-hidden="true"
                    />
                    <PhArrowsDownUp v-else :size="14" aria-hidden="true" />
                  </button>
                </div>

                <div class="grid gap-2">
                  <ProtocolComparisonCard
                    v-for="provider in providerItems"
                    :id="provider.id"
                    :key="provider.id"
                    :label="provider.label"
                    :link="provider.destination?.href"
                    :destination-label="provider.destination?.label"
                    :quote="provider.group?.primaryQuote"
                    :status="providerStatus(provider)"
                    :amount="effectiveBorrowAmount"
                    :assets="positiveAssets"
                    :expanded="expandedMarketId === provider.id"
                    @toggle="toggleMarket"
                  />
                </div>
              </section>
            </div>
          </Transition>
        </div>

        <EstimatorReceiptDetails
          v-if="currentStage === 'comparison'"
          class="mt-5"
          :wallet-name="receipt.walletName"
          :wallet-identity-label="walletIdentityLabel"
          :block-number="receipt.blockNumber"
          :block-timestamp="receipt.blockTimestamp"
          :block-loaded-at-label="blockLoadedAtLabel"
          :calls-succeeded="receipt.callsSucceeded"
          :calls-attempted="receipt.callsAttempted"
        />
      </div>
    </Transition>

    <WalletConnectDialog
      ref="walletDialog"
      :wallets="orderedProviders"
      :discovery-complete="walletDiscoveryComplete"
      :remembered-wallet-rdns="rememberedWalletRdns || undefined"
      @select="connectFromMenu"
    />

    <p class="relative z-40 mt-auto self-end px-4 pb-4 pt-4 sm:px-6 lg:px-8">
      <a
        href="https://own.casa"
        target="_blank"
        rel="noopener noreferrer"
        class="focus-ring inline-flex min-h-8 items-center gap-1 rounded-md px-1 text-xs text-slate transition-colors hover:text-ink"
        aria-label="OWN"
      >
        <span>built by</span>
        <img
          :src="'./brands/own.svg'"
          alt=""
          class="relative -top-px h-3.5 w-auto"
          aria-hidden="true"
        />
      </a>
    </p>
  </main>
</template>
