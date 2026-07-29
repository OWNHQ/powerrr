<script setup lang="ts">
import { PhInfo, PhShieldCheck, PhWarningCircle } from "@phosphor-icons/vue";
import type { PooledBorrowPreview } from "../utils/borrow-preview";
import { formatUsdValue } from "../utils/estimator-ux";

const props = defineProps<{
  amountUsd: number;
  maximumUsd: number;
  riskTitle: string;
  riskDescription: string;
  pooledPreview: PooledBorrowPreview | null;
  pooledRateLabel: string;
  announcement: string;
}>();

function pooledStatusClass(): string {
  switch (props.pooledPreview?.riskBand) {
    case "wide":
      return "text-river";
    case "reduced":
      return "text-warning";
    case "thin":
    case "at-boundary":
    case "above-threshold":
      return "text-coral";
    default:
      return "text-slate";
  }
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
    class="mt-4 overflow-hidden rounded-xl border border-line bg-mist/45"
    aria-labelledby="risk-title"
  >
    <div
      class="flex flex-col gap-4 border-b border-line px-5 py-5 sm:flex-row sm:items-start sm:justify-between"
    >
      <div class="flex min-w-0 items-start gap-4">
        <span
          class="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface shadow-sm"
          :class="pooledStatusClass()"
        >
          <PhShieldCheck
            v-if="pooledPreview?.riskBand === 'wide'"
            :size="25"
            weight="fill"
            aria-hidden="true"
          />
          <PhInfo
            v-else-if="pooledPreview?.riskBand === 'none'"
            :size="25"
            weight="fill"
            aria-hidden="true"
          />
          <PhWarningCircle v-else :size="25" weight="fill" aria-hidden="true" />
        </span>
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h3
              id="risk-title"
              class="text-lg font-semibold"
              :class="pooledStatusClass()"
            >
              {{ riskTitle }}
            </h3>
          </div>
          <p class="mt-1 max-w-2xl text-sm leading-6 text-slate">
            {{ riskDescription }}
          </p>
        </div>
      </div>
      <div class="shrink-0 sm:text-right">
        <p class="text-xs font-medium uppercase tracking-wide text-slate">
          Amount reviewed
        </p>
        <p class="mt-1 text-xl font-semibold tabular-nums">
          {{ formatUsdValue(amountUsd) }} USDC
        </p>
        <p class="mt-1 text-xs text-slate">
          {{ formatPercent(amountUsd / maximumUsd, 0) }} of Powerrr’s estimated
          path limit
        </p>
      </div>
    </div>

    <template v-if="pooledPreview">
      <p
        class="bg-surface px-5 pt-4 text-xs font-bold uppercase tracking-[0.12em] text-slate"
      >
        Projected position
      </p>
      <dl
        aria-label="Projected position"
        class="grid grid-cols-2 divide-x divide-y divide-line bg-surface sm:grid-cols-3 sm:divide-y-0"
      >
        <div class="p-4 sm:p-5">
          <dt>Collateral in estimate</dt>
          <dd>{{ formatUsdValue(pooledPreview.collateralValueUsd) }}</dd>
        </div>
        <div class="p-4 sm:p-5">
          <dt>
            {{
              pooledPreview.mode === "existing-position"
                ? "Existing debt included"
                : "Starting debt in scenario"
            }}
          </dt>
          <dd>
            {{ formatUsdValue(pooledPreview.startingDebtUsd) }}
            <span class="mt-1 block text-[0.7rem] leading-4 text-slate">
              {{
                pooledPreview.mode === "existing-position"
                  ? "Before this borrow"
                  : "New-position estimate"
              }}
            </span>
          </dd>
        </div>
        <div class="p-4 sm:p-5">
          <dt>Projected total debt</dt>
          <dd>{{ formatUsdValue(pooledPreview.projectedDebtUsd) }}</dd>
        </div>
        <div class="p-4 sm:p-5">
          <dt>Liquidation headroom</dt>
          <dd>
            {{ formatUsdValue(pooledPreview.liquidationHeadroomUsd) }}
            <span class="mt-1 block text-[0.7rem] leading-4 text-slate">
              Capacity at threshold minus debt
            </span>
          </dd>
        </div>
        <div class="p-4 sm:p-5">
          <dt>Recommended limit used</dt>
          <dd>
            {{ formatPercent(pooledPreview.recommendedLimitUtilization, 0) }}
          </dd>
        </div>
        <div class="p-4 sm:p-5">
          <dt>Borrow rate</dt>
          <dd>
            {{ pooledRateLabel }}
            <span class="mt-1 block text-[0.7rem] leading-4 text-slate">
              Indicative until executed
            </span>
          </dd>
        </div>
      </dl>

      <p
        class="border-t border-line bg-surface px-5 pt-4 text-xs font-bold uppercase tracking-[0.12em] text-slate"
      >
        Protocol thresholds
      </p>
      <dl
        aria-label="Protocol thresholds"
        class="grid grid-cols-2 divide-x divide-y divide-line bg-surface sm:grid-cols-4 sm:divide-y-0"
      >
        <div class="p-4 sm:p-5">
          <dt>Projected LTV</dt>
          <dd>
            {{ formatPercent(pooledPreview.projectedLtv) }}
            <span class="mt-1 block text-[0.7rem] leading-4 text-slate">
              Projected debt ÷ collateral
            </span>
          </dd>
        </div>
        <div class="p-4 sm:p-5">
          <dt>Borrow limit (weighted)</dt>
          <dd>{{ formatPercent(pooledPreview.borrowLimitLtv) }}</dd>
        </div>
        <div class="p-4 sm:p-5">
          <dt>Liquidation threshold (weighted)</dt>
          <dd>{{ formatPercent(pooledPreview.liquidationThresholdLtv) }}</dd>
        </div>
        <div class="p-4 sm:p-5">
          <dt>Projected health factor</dt>
          <dd>
            {{ formatHealth(pooledPreview.healthFactor) }}
            <span class="mt-1 block text-[0.7rem] leading-4 text-slate">
              1.00 = liquidation threshold
            </span>
          </dd>
        </div>
      </dl>
    </template>

    <p class="border-t border-line px-5 py-4 text-xs leading-5 text-slate">
      Projected values assume the collateral listed by this path is supplied and
      the reviewed amount is borrowed.
      <template v-if="pooledPreview?.mode === 'wallet-estimate'">
        This new-position estimate does not include any existing protocol debt.
      </template>
      Borrow and liquidation limits are value-weighted across that collateral;
      some protocols use the same factor for both. Powerrr’s estimated path
      limit includes a safety buffer and available liquidity, so it can be lower
      than the protocol borrow limit. Rates, oracle prices, factors, and
      liquidity can change before execution. The wide, reduced, and thin labels
      describe proximity to the current 1.00 boundary; they are not a
      probability or personalized safety advice.
    </p>
    <p class="sr-only" aria-live="polite">{{ announcement }}</p>
  </section>
</template>
