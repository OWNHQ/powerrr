<script setup lang="ts">
import {
  PhArrowSquareOut,
  PhCaretDown,
  PhCheck,
  PhInfo,
  PhUser,
  PhWarningCircle,
  PhWallet,
} from "@phosphor-icons/vue";
const {
  configuredFixtureMode,
  input,
  selectedProviderId,
  borrowAmountUsd,
  walletError,
  showSearch,
  showOwnLead,
  assetsExpanded,
  ownLeadStatus,
  landingInput,
  resultSummary,
  examples,
  estimatorMutation,
  quoteResponse,
  portfolio,
  ownOpportunity,
  providerItems,
  bestExternalId,
  maxBorrowUsd,
  usableAssets,
  usableCollateralUsd,
  conversionRequiredAssets,
  pooledPreview,
  ownLtv,
  ownTotalRepayment,
  selectedOwnFundingLabel,
  selectedOwnFundingClass,
  selectedRiskTitle,
  selectedRiskDescription,
  selectedProviderLabel,
  selectedRate,
  selectedRateConvention,
  selectedAnnualInterest,
  selectedExternalLink,
  displayAddress,
  isDemoData,
  isOwnActionable,
  actionableProviderCount,
  hasProviderOutage,
  hasActionableSelection,
  utilizationPercent,
  ownUnavailableReason,
  estimateFreshnessLabel,
  riskAnnouncement,
  submit,
  retryEstimator,
  openWalletSearch,
  toggleWalletSearch,
  connectWallet,
  useExample,
  selectProvider,
  providerStatusLabel,
  providerStatusClass,
  formatUsd,
  formatPercent,
  friendlyEstimatorError,
} = useEstimatorState();
</script>

<template>
  <a href="#main-content" class="skip-link">Skip to estimator</a>
  <main id="main-content" class="min-h-screen bg-paper text-ink">
    <header
      class="sticky top-0 z-30 border-b border-line/80 bg-white/95 backdrop-blur"
    >
      <div
        class="mx-auto flex h-16 w-full max-w-[1360px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"
      >
        <a
          href="/"
          class="focus-ring rounded-md text-2xl font-bold tracking-[-0.04em] text-ink"
          >Powerrr</a
        >
        <div class="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            v-if="quoteResponse"
            type="button"
            class="focus-ring flex h-11 min-w-0 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-medium hover:border-river"
            :aria-expanded="showSearch"
            @click="toggleWalletSearch"
          >
            <PhUser :size="18" aria-hidden="true" />
            <span class="max-w-28 truncate sm:max-w-36">{{
              displayAddress
            }}</span>
            <span
              class="h-2 w-2 shrink-0 rounded-full sm:hidden"
              :class="isDemoData ? 'bg-amber-500' : 'bg-moss'"
              aria-hidden="true"
            ></span>
            <span class="sr-only">{{
              isDemoData ? "Demo data" : "Live Ethereum preview"
            }}</span>
            <PhCaretDown :size="14" aria-hidden="true" />
          </button>
          <button
            v-else
            type="button"
            class="focus-ring flex h-11 items-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold"
            @click="connectWallet"
          >
            <PhWallet :size="18" aria-hidden="true" />
            <span class="sm:hidden">Connect</span>
            <span class="hidden sm:inline">Connect wallet</span>
          </button>
          <span
            v-if="quoteResponse"
            class="hidden items-center gap-2 text-sm text-slate sm:flex"
          >
            <span
              class="h-2 w-2 rounded-full"
              :class="isDemoData ? 'bg-amber-500' : 'bg-moss'"
            ></span>
            {{ isDemoData ? "Demo data" : "Live Ethereum · preview" }}
          </span>
        </div>
      </div>
      <form
        v-if="showSearch && quoteResponse"
        class="border-t border-line bg-mist/60"
        @submit.prevent="submit"
      >
        <div class="mx-auto flex w-full max-w-3xl gap-2 px-4 py-3">
          <input
            ref="landingInput"
            v-model="input"
            class="field-control mt-0"
            aria-label="Ethereum address or ENS"
            placeholder="ENS or 0x address"
          />
          <button
            class="focus-ring min-h-11 rounded-lg bg-ink px-5 text-sm font-semibold text-white"
            type="submit"
          >
            Update
          </button>
        </div>
      </form>
    </header>

    <section
      v-if="estimatorMutation.isPending.value"
      class="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl place-items-center px-4 py-16"
    >
      <div class="mx-auto max-w-xl text-center">
        <div
          class="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-line border-t-river"
        ></div>
        <h1 class="mt-6 text-2xl font-semibold">Finding usable collateral</h1>
        <p class="mt-2 text-sm leading-6 text-slate">
          Checking the supported asset registry and live provider rules. This
          can take a few seconds.
        </p>
      </div>
    </section>

    <section
      v-else-if="estimatorMutation.error.value && !quoteResponse"
      class="mx-auto grid min-h-[calc(100vh-4rem)] max-w-3xl place-items-center px-4 py-16"
    >
      <div
        class="w-full rounded-2xl border border-line bg-white p-6 text-center shadow-panel sm:p-10"
      >
        <PhWarningCircle
          :size="48"
          class="mx-auto text-coral"
          aria-hidden="true"
        />
        <h1 class="mt-4 text-2xl font-semibold">
          We couldn’t estimate this wallet
        </h1>
        <p class="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate">
          {{ friendlyEstimatorError(estimatorMutation.error.value) }}
        </p>
        <form
          class="mx-auto mt-7 flex max-w-2xl flex-col gap-3 sm:flex-row"
          @submit.prevent="submit"
        >
          <label class="min-w-0 flex-1 text-left">
            <span class="field-label">Ethereum address or ENS</span>
            <input
              ref="landingInput"
              v-model="input"
              class="field-control mt-0 h-12"
              placeholder="name.eth or 0x…"
              autocomplete="off"
            />
          </label>
          <button
            type="submit"
            class="focus-ring min-h-12 self-end rounded-lg bg-river px-6 text-sm font-semibold text-white hover:bg-river/90"
          >
            Try again
          </button>
        </form>
        <button
          type="button"
          class="focus-ring mt-5 min-h-11 rounded-lg px-4 text-sm font-semibold text-river hover:bg-blue-50"
          @click="retryEstimator"
        >
          Clear error and edit address
        </button>
      </div>
    </section>

    <section
      v-else-if="!quoteResponse"
      class="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl place-items-center px-4 py-16"
    >
      <div class="w-full max-w-3xl text-center">
        <p class="text-sm font-bold uppercase tracking-[0.18em] text-river">
          Borrow with your onchain assets
        </p>
        <h1 class="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">
          See what your wallet can unlock.
        </h1>
        <p
          class="mx-auto mt-5 max-w-xl text-base leading-7 text-slate sm:text-lg"
        >
          Enter an Ethereum address to see usable collateral, compare providers,
          and review threshold-based risk before you borrow.
        </p>
        <form
          class="mx-auto mt-9 flex max-w-2xl flex-col gap-3 rounded-2xl border border-line bg-white p-3 shadow-panel sm:flex-row"
          @submit.prevent="submit"
        >
          <label class="min-w-0 flex-1 text-left">
            <span class="sr-only">Ethereum address or ENS</span>
            <input
              ref="landingInput"
              v-model="input"
              class="h-12 w-full rounded-lg border-0 px-3 text-base outline-none"
              placeholder="name.eth or 0x…"
              autocomplete="off"
            />
          </label>
          <button
            type="submit"
            class="focus-ring h-12 rounded-lg bg-river px-6 text-sm font-semibold text-white hover:bg-river/90"
          >
            Check borrowing power
          </button>
        </form>
        <p v-if="walletError" class="mt-3 text-sm text-coral">
          {{ walletError }}
        </p>
        <p class="mx-auto mt-4 max-w-lg text-xs leading-5 text-slate">
          Read-only estimate. Connecting or entering a wallet never submits a
          transaction.
        </p>
        <div
          v-if="configuredFixtureMode"
          class="mt-6 flex flex-wrap justify-center gap-2"
        >
          <button
            v-for="example in examples"
            :key="example.value"
            type="button"
            class="focus-ring rounded-full border border-line bg-white px-3 py-2 text-xs font-semibold text-slate hover:border-river hover:text-river"
            @click="useExample(example.value)"
          >
            {{ example.label }}
          </button>
        </div>
      </div>
    </section>

    <div
      v-else-if="quoteResponse && portfolio"
      class="mx-auto w-full max-w-[1360px] px-4 py-7 sm:px-6 lg:px-8 lg:py-10"
    >
      <EstimatorResultSummary
        ref="resultSummary"
        :demo="isDemoData"
        :address="displayAddress"
        :matched-collateral="formatUsd(usableCollateralUsd)"
        :asset-count="portfolio.assets.length"
        :provider-count="actionableProviderCount"
        :freshness="estimateFreshnessLabel"
      />

      <nav
        aria-label="Estimator sections"
        class="compact-progress mb-5 grid grid-cols-3 gap-2"
      >
        <a
          href="#assets"
          class="compact-step"
          :class="
            usableAssets.length
              ? 'compact-step-complete'
              : 'compact-step-active'
          "
          :aria-current="!usableAssets.length ? 'step' : undefined"
        >
          <span class="progress-number"
            ><PhCheck
              v-if="usableAssets.length"
              :size="15"
              weight="bold"
              aria-hidden="true"
            /><template v-else>1</template></span
          >
          <span><strong>Assets</strong><small>Confirmed matches</small></span>
        </a>
        <a
          href="#providers"
          class="compact-step"
          :class="
            hasActionableSelection
              ? 'compact-step-complete'
              : usableAssets.length
                ? 'compact-step-active'
                : ''
          "
          :aria-current="
            usableAssets.length && !hasActionableSelection ? 'step' : undefined
          "
        >
          <span class="progress-number"
            ><PhCheck
              v-if="hasActionableSelection"
              :size="15"
              weight="bold"
              aria-hidden="true"
            /><template v-else>2</template></span
          >
          <span><strong>Provider</strong><small>Compare options</small></span>
        </a>
        <a
          href="#amount"
          class="compact-step"
          :class="hasActionableSelection ? 'compact-step-active' : ''"
          :aria-current="hasActionableSelection ? 'step' : undefined"
          :aria-disabled="!hasActionableSelection"
          @click="!hasActionableSelection && $event.preventDefault()"
        >
          <span class="progress-number">3</span>
          <span
            ><strong>Amount & risk</strong><small>Review threshold</small></span
          >
        </a>
      </nav>

      <EstimatorAssets
        :assets="usableAssets"
        :expanded="assetsExpanded"
        :demo="isDemoData"
        :has-conversions="conversionRequiredAssets.length > 0"
        @change-wallet="openWalletSearch"
        @toggle-expanded="assetsExpanded = !assetsExpanded"
      />

      <section
        v-if="usableAssets.length"
        id="providers"
        class="panel mt-5 scroll-mt-36 p-5"
        aria-labelledby="providers-title"
      >
        <div>
          <h2 id="providers-title" class="text-lg font-semibold">
            Choose a provider
          </h2>
          <p class="mt-1 text-sm text-slate">
            Compare estimated borrowing power and rates, then select an option
            to review risk.
          </p>
        </div>

        <div role="radiogroup" aria-labelledby="providers-title">
          <button
            v-if="ownOpportunity"
            type="button"
            role="radio"
            class="focus-ring group mt-5 grid min-h-32 w-full gap-5 rounded-2xl border p-5 text-left transition sm:grid-cols-[1fr_auto] sm:items-center"
            :class="[
              selectedProviderId === 'own'
                ? 'border-own bg-ownsoft shadow-lg'
                : 'border-own/30 bg-white',
              isOwnActionable
                ? 'hover:border-own'
                : 'cursor-not-allowed opacity-75',
            ]"
            :aria-checked="selectedProviderId === 'own'"
            :disabled="!isOwnActionable"
            @click="selectProvider('own', ownOpportunity.potentialBorrowUsd)"
          >
            <span class="flex min-w-0 items-start gap-4">
              <span
                class="mt-0.5 grid h-12 w-16 shrink-0 place-items-center rounded-xl bg-ownsoft p-2"
              >
                <OwnLogo />
              </span>
              <span class="min-w-0">
                <span class="flex flex-wrap items-center gap-2">
                  <strong class="text-xl">OWN</strong>
                  <span
                    class="rounded-full bg-own px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-white"
                    >Featured</span
                  >
                  <span
                    class="rounded-full px-2.5 py-1 text-xs font-semibold"
                    :class="
                      isOwnActionable
                        ? providerStatusClass(ownOpportunity)
                        : 'bg-slate-100 text-slate'
                    "
                  >
                    {{
                      isOwnActionable
                        ? providerStatusLabel(ownOpportunity)
                        : "Unavailable"
                    }}
                  </span>
                </span>
                <span class="mt-2 block text-sm text-slate"
                  >OWN’s indicative fixed-term request option</span
                >
                <span class="mt-3 block text-xs leading-5 text-slate"
                  >No automatic price-triggered liquidation. Repay by the agreed
                  maturity date.</span
                >
              </span>
            </span>
            <span class="sm:max-w-sm sm:text-right">
              <template v-if="isOwnActionable">
                <span
                  class="block text-xs font-medium uppercase tracking-wide text-slate"
                  >Indicative capacity</span
                >
                <strong class="mt-1 block tabular-nums text-2xl tracking-tight"
                  >Up to
                  {{ formatUsd(ownOpportunity.potentialBorrowUsd) }}</strong
                >
                <span class="mt-1 block text-xs text-slate"
                  >{{ formatPercent(ownOpportunity.indicativeApr) }} fixed APR ·
                  {{ ownOpportunity.termMonths }} months</span
                >
              </template>
              <template v-else>
                <span
                  class="block text-xs font-medium uppercase tracking-wide text-slate"
                  >Not selectable</span
                >
                <strong class="mt-1 block text-lg">{{
                  ownUnavailableReason
                }}</strong>
                <span
                  v-if="ownOpportunity.potentialBorrowUsd > 0"
                  class="mt-1 block text-xs text-slate"
                >
                  Indicative capacity
                  {{ formatUsd(ownOpportunity.potentialBorrowUsd) }}
                </span>
              </template>
            </span>
          </button>

          <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ExternalProviderOption
              v-for="provider in providerItems"
              :key="provider.id"
              :provider="provider"
              :selected="selectedProviderId === provider.id"
              :highest-capacity="provider.id === bestExternalId"
              @select="selectProvider"
            />
          </div>
        </div>

        <div
          v-if="hasProviderOutage"
          class="mt-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between"
        >
          <span
            >One or more live provider estimates could not be refreshed.</span
          >
          <button
            type="button"
            class="focus-ring min-h-11 rounded-lg border border-amber-300 bg-white px-4 font-semibold hover:border-amber-500"
            @click="submit"
          >
            Retry providers
          </button>
        </div>
      </section>

      <EstimatorRiskPanel
        v-if="maxBorrowUsd > 0"
        v-model:amount="borrowAmountUsd"
        v-model:utilization="utilizationPercent"
        :maximum-usd="maxBorrowUsd"
        :selected-provider-id="selectedProviderId"
        :risk-title="selectedRiskTitle"
        :risk-description="selectedRiskDescription"
        :own-funding-class="selectedOwnFundingClass"
        :own-funding-label="selectedOwnFundingLabel"
        :own-opportunity="ownOpportunity"
        :own-ltv="ownLtv"
        :own-total-repayment="ownTotalRepayment"
        :pooled-preview="pooledPreview"
        :announcement="riskAnnouncement"
      />

      <section
        v-if="maxBorrowUsd > 0"
        class="mt-5 overflow-hidden rounded-2xl border border-line bg-white shadow-panel"
        aria-label="Next step"
      >
        <div
          class="grid gap-5 px-5 py-5 sm:grid-cols-[1fr_auto] sm:items-center sm:px-6"
        >
          <div class="flex min-w-0 items-center gap-4">
            <span
              v-if="selectedProviderId === 'own'"
              class="grid h-11 w-16 shrink-0 place-items-center rounded-xl bg-ownsoft p-2"
            >
              <OwnLogo />
            </span>
            <img
              v-else
              src="/tokens/usdc.png"
              alt="USDC"
              class="h-11 w-11 shrink-0 rounded-full"
            />
            <div class="min-w-0">
              <p class="tabular-nums font-semibold">
                Review {{ formatUsd(borrowAmountUsd) }} USDC
                {{ selectedProviderId === "own" ? "with" : "on" }}
                {{ selectedProviderLabel }}
              </p>
              <p
                id="next-step-description"
                class="mt-1 text-sm leading-6 text-slate"
              >
                {{
                  selectedProviderId === "own"
                    ? `${formatPercent(selectedRate)} fixed APR · ${ownOpportunity?.termMonths} months · indicative`
                    : `${formatUsd(selectedAnnualInterest)} approximate first-year interest at the current ${formatPercent(selectedRate)} variable ${selectedRateConvention}`
                }}
              </p>
            </div>
          </div>
          <button
            v-if="selectedProviderId === 'own'"
            type="button"
            class="focus-ring flex h-12 items-center justify-center gap-2 rounded-lg bg-river px-7 text-sm font-semibold text-white hover:bg-river/90"
            aria-describedby="next-step-description"
            @click="showOwnLead = true"
          >
            Request an OWN offer
          </button>
          <a
            v-else
            :href="selectedExternalLink"
            target="_blank"
            rel="noopener noreferrer"
            class="focus-ring flex h-12 items-center justify-center gap-2 rounded-lg bg-river px-7 text-sm font-semibold text-white hover:bg-river/90"
            aria-describedby="next-step-description external-provider-note"
          >
            Review on {{ selectedProviderLabel }}
            <PhArrowSquareOut :size="18" aria-hidden="true" />
            <span class="sr-only">(opens in a new tab)</span>
          </a>
        </div>
        <div
          class="flex items-start gap-2 border-t border-line bg-mist/50 px-5 py-3 text-xs leading-5 text-slate sm:px-6"
        >
          <PhInfo :size="17" class="mt-0.5 shrink-0" aria-hidden="true" />
          <p v-if="selectedProviderId === 'own'">
            Indicative only; subject to OWN review, lender matching, verified
            funding, and final documentation. Policy
            {{ ownOpportunity?.policyVersion }}.
          </p>
          <p v-else id="external-provider-note">
            This estimate does not transfer to {{ selectedProviderLabel }}.
            Recreate and verify the position there before continuing; rates and
            protocol conditions can change.
          </p>
        </div>
      </section>
    </div>

    <OwnLeadModal
      v-if="showOwnLead && ownOpportunity && ownLeadStatus"
      :opportunity="ownOpportunity"
      :wallet="
        quoteResponse?.resolvedEnsName ||
        quoteResponse?.resolvedAddress ||
        input
      "
      :amount-usd="borrowAmountUsd"
      :status="ownLeadStatus"
      @close="showOwnLead = false"
    />
  </main>
</template>
