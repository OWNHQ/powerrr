<script setup lang="ts">
import { PhShieldCheck, PhWarningCircle } from "@phosphor-icons/vue";
import type { BorrowOpportunity } from "@powerrr/shared-types";
import type { PooledBorrowPreview } from "../utils/borrow-preview";
import {
  amountForUtilization,
  amountInputStep,
  formatUsdValue,
} from "../utils/estimator-ux";

const props = defineProps<{
  maximumUsd: number;
  selectedProviderId: string;
  riskTitle: string;
  riskDescription: string;
  ownFundingClass: string;
  ownFundingLabel: string;
  ownOpportunity: BorrowOpportunity | null;
  ownLtv: number;
  ownTotalRepayment: number;
  pooledPreview: PooledBorrowPreview | null;
  announcement: string;
}>();

const amount = defineModel<number>("amount", { required: true });
const utilization = defineModel<number>("utilization", { required: true });

function onAmountInput(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  if (Number.isFinite(value)) {
    amount.value = Math.max(0, Math.min(props.maximumUsd, value));
  }
}

function setUtilization(percent: number): void {
  utilization.value = percent;
}

function pooledStatusClass(): string {
  if (props.pooledPreview?.status === "comfortable") return "text-moss";
  if (props.pooledPreview?.status === "watch") return "text-amber-700";
  return "text-coral";
}

function formatCompactUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: value >= 100_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 100_000 ? 1 : 0,
  }).format(value);
}

function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: digits,
  }).format(value);
}

function formatHealth(value: number | null | undefined): string {
  return value !== null && value !== undefined && Number.isFinite(value)
    ? value.toFixed(2)
    : "—";
}
</script>

<template>
  <section
    id="amount"
    class="panel mt-5 scroll-mt-36 overflow-hidden"
    aria-labelledby="amount-title"
  >
    <div class="grid lg:grid-cols-[1fr_1.05fr]">
      <div class="p-5 sm:p-6">
        <h2 id="amount-title" class="text-lg font-semibold">
          Set amount and review risk
        </h2>
        <p id="amount-help" class="mt-1 text-sm text-slate">
          Enter an amount or adjust the percentage of estimated borrowing power.
        </p>

        <label
          class="mt-6 block rounded-xl border border-line bg-white px-4 py-3"
        >
          <span class="text-xs font-medium text-slate"
            >Borrow amount (USDC)</span
          >
          <span class="mt-1 flex items-center gap-3">
            <img
              src="/tokens/usdc.png"
              alt="USDC"
              class="h-8 w-8 rounded-full"
            />
            <span class="text-3xl font-semibold text-slate" aria-hidden="true"
              >$</span
            >
            <input
              :value="amount"
              type="number"
              min="0"
              :max="maximumUsd"
              :step="amountInputStep(maximumUsd)"
              inputmode="decimal"
              class="min-w-0 flex-1 bg-transparent text-3xl font-semibold tracking-[-0.04em] outline-none"
              aria-describedby="amount-help"
              @input="onAmountInput"
              @blur="amount = Math.max(0, Math.min(maximumUsd, amount))"
            />
          </span>
        </label>

        <input
          v-model.number="utilization"
          type="range"
          min="0"
          max="100"
          step="1"
          class="amount-range mt-6 w-full"
          :class="{ 'amount-range-own': selectedProviderId === 'own' }"
          :style="{ '--range-progress': `${utilization}%` }"
          aria-label="Borrowing power used"
          :aria-valuetext="`${Math.round(utilization)}% · ${formatUsdValue(amount)}`"
          aria-describedby="amount-help"
        />
        <div class="mt-2 flex justify-between text-xs text-slate">
          <span>0%</span>
          <span class="tabular-nums"
            >{{ formatCompactUsd(maximumUsd) }} max</span
          >
        </div>

        <div class="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            v-for="percent in [25, 50, 75, 100]"
            :key="percent"
            type="button"
            class="focus-ring min-h-14 rounded-lg border px-3 py-2 text-sm font-semibold"
            :class="
              Math.abs(utilization - percent) < 0.5
                ? 'border-river bg-blue-50 text-river'
                : 'border-line hover:border-river'
            "
            @click="setUtilization(percent)"
          >
            <span>{{ percent === 100 ? "Max" : `${percent}%` }}</span>
            <span
              class="mt-0.5 block tabular-nums text-xs font-medium text-slate"
              >{{
                formatUsdValue(amountForUtilization(maximumUsd, percent))
              }}</span
            >
          </button>
        </div>
      </div>

      <aside class="border-t border-line bg-mist/55 lg:border-l lg:border-t-0">
        <div
          class="flex items-start gap-4 border-b border-line px-5 py-5 sm:px-6"
        >
          <span
            class="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white shadow-sm"
            :class="
              selectedProviderId === 'own' ? 'text-river' : pooledStatusClass()
            "
          >
            <PhShieldCheck
              v-if="
                selectedProviderId === 'own' ||
                pooledPreview?.status === 'comfortable'
              "
              :size="28"
              weight="fill"
              aria-hidden="true"
            />
            <PhWarningCircle
              v-else
              :size="28"
              weight="fill"
              aria-hidden="true"
            />
          </span>
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h3
                class="text-xl font-semibold"
                :class="
                  selectedProviderId === 'own'
                    ? 'text-river'
                    : pooledStatusClass()
                "
              >
                {{ riskTitle }}
              </h3>
              <span
                v-if="selectedProviderId === 'own'"
                class="rounded-full px-2.5 py-1 text-xs font-semibold"
                :class="ownFundingClass"
                >{{ ownFundingLabel }}</span
              >
            </div>
            <p class="mt-1 text-sm leading-6 text-slate">
              {{ riskDescription }}
            </p>
          </div>
        </div>

        <dl
          v-if="selectedProviderId === 'own' && ownOpportunity"
          class="grid grid-cols-2 divide-x divide-y divide-line sm:grid-cols-4 sm:divide-y-0"
        >
          <div class="p-5">
            <dt>Indicative LTV</dt>
            <dd>
              {{ formatPercent(ownLtv) }}
              <span
                class="mt-1 block text-xs font-normal leading-4 tracking-normal text-slate"
                >Loan amount divided by pledged collateral.</span
              >
            </dd>
          </div>
          <div class="p-5">
            <dt>Fixed APR</dt>
            <dd>{{ formatPercent(ownOpportunity.indicativeApr) }}</dd>
          </div>
          <div class="p-5">
            <dt>Duration</dt>
            <dd>{{ ownOpportunity.termMonths }} mo</dd>
          </div>
          <div class="p-5">
            <dt>Total due</dt>
            <dd>{{ formatUsdValue(ownTotalRepayment) }}</dd>
          </div>
        </dl>
        <dl
          v-else-if="pooledPreview"
          class="grid grid-cols-2 divide-x divide-y divide-line sm:grid-cols-4 sm:divide-y-0"
        >
          <div class="p-5">
            <dt>{{ pooledPreview.healthMetricLabel }}</dt>
            <dd>
              {{ formatHealth(pooledPreview.healthMetric) }}
              <span
                class="mt-1 block text-xs font-normal leading-4 tracking-normal text-slate"
                >Distance from the provider liquidation threshold.</span
              >
            </dd>
          </div>
          <div class="p-5">
            <dt>Collateral decline</dt>
            <dd>
              {{
                formatPercent(pooledPreview.collateralDeclineToLiquidation, 0)
              }}
              <span
                class="mt-1 block text-xs font-normal leading-4 tracking-normal text-slate"
                >Estimated price fall that would reach liquidation.</span
              >
            </dd>
          </div>
          <div class="p-5">
            <dt>Current LTV</dt>
            <dd>
              {{ formatPercent(pooledPreview.ltv) }}
              <span
                class="mt-1 block text-xs font-normal leading-4 tracking-normal text-slate"
                >Debt divided by the matched collateral value.</span
              >
            </dd>
          </div>
          <div class="p-5">
            <dt>Borrowing power used</dt>
            <dd>
              {{ formatPercent(pooledPreview.borrowingPowerUsage, 0) }}
              <span
                class="mt-1 block text-xs font-normal leading-4 tracking-normal text-slate"
                >Share of the provider’s estimated safe limit.</span
              >
            </dd>
          </div>
        </dl>

        <div
          class="border-t border-line px-5 py-4 text-xs leading-5 text-slate sm:px-6"
        >
          <template v-if="selectedProviderId === 'own'">
            If the loan is not repaid by maturity and enters default, the lender
            may claim the pledged collateral under the final agreement. Price
            changes alone do not automatically liquidate an OWN position.
          </template>
          <template v-else>
            Threshold preview only—this is not a prediction. Rates, oracle
            prices, collateral factors, and liquidity can change before
            execution.
          </template>
        </div>
      </aside>
    </div>
    <p class="sr-only" aria-live="polite">{{ announcement }}</p>
  </section>
</template>
