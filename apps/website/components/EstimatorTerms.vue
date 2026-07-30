<script setup lang="ts">
import { PhArrowLeft } from "@phosphor-icons/vue";
import {
  amountForTargetLtv,
  amountInputStep,
  formatUsdValue,
} from "../utils/estimator-ux";

const props = defineProps<{
  comparisonCeilingUsd: number;
  providerMaximumUsd: number;
  selectedAssetValueUsd: number;
  ltvReferenceProvider: string;
  ltvReferenceCollateralUsd: number;
  ltvReferenceExistingDebtUsd: number;
  error: string;
}>();

const emit = defineEmits<{ back: [] }>();
const amount = defineModel<number>("amount", { required: true });
const editing = ref(false);
const ltvTargets = [25, 50, 75] as const;
const amountText = ref(formatAmount(amount.value));
const progress = computed(() =>
  props.comparisonCeilingUsd > 0
    ? Math.min(100, (amount.value / props.comparisonCeilingUsd) * 100)
    : 0,
);
const projectedLtvPercent = computed(() => {
  if (props.ltvReferenceCollateralUsd <= 0) return null;
  return (
    ((amount.value + props.ltvReferenceExistingDebtUsd) /
      props.ltvReferenceCollateralUsd) *
    100
  );
});

watch(amount, (value) => {
  if (!editing.value) amountText.value = formatAmount(value);
});

function formatAmount(value: number): string {
  if (value <= 0) return "0";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: props.comparisonCeilingUsd < 100 ? 2 : 0,
  }).format(value);
}

function onTextInput(event: Event): void {
  amountText.value = (event.target as HTMLInputElement).value;
  const value = Number(amountText.value.replaceAll(",", "").replace("$", ""));
  amount.value = Number.isFinite(value) ? Math.max(0, value) : 0;
}

function onRangeInput(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  if (Number.isFinite(value)) amount.value = Math.max(0, value);
}

function selectLtv(targetPercent: number): void {
  amount.value = amountForTargetLtv(
    props.ltvReferenceCollateralUsd,
    props.ltvReferenceExistingDebtUsd,
    targetPercent,
  );
}

function isSelectedLtv(targetPercent: number): boolean {
  return (
    projectedLtvPercent.value !== null &&
    Math.abs(projectedLtvPercent.value - targetPercent) < 0.05
  );
}
</script>

<template>
  <section class="panel overflow-hidden" aria-labelledby="terms-title">
    <div class="border-b border-line px-5 py-4 sm:px-6 sm:py-5">
      <h2 id="terms-title" class="type-title">Compare borrowing paths</h2>
      <p class="mt-1 max-w-2xl text-sm leading-5 text-slate">
        Enter one USDC amount to test across every available path.
      </p>
    </div>

    <div class="p-5 sm:p-6">
      <div>
        <div class="flex items-start justify-between gap-4">
          <div>
            <h3 class="text-sm font-semibold">Projected LTV</h3>
            <p class="mt-0.5 text-xs leading-5 text-slate">
              {{ ltvReferenceProvider || "Highest-capacity pooled path" }}
              reference
            </p>
          </div>
          <p
            v-if="projectedLtvPercent !== null"
            class="shrink-0 text-right text-xs text-slate"
          >
            <strong class="type-data block text-base text-ink">
              {{ projectedLtvPercent.toFixed(1) }}%
            </strong>
            current
          </p>
        </div>
        <div
          class="mt-3 grid grid-cols-3 gap-1 rounded-lg border border-line bg-mist/55 p-1"
          role="group"
          aria-label="Set borrow amount by projected LTV"
        >
          <button
            v-for="target in ltvTargets"
            :key="target"
            type="button"
            class="focus-ring min-h-10 rounded-md px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45"
            :class="
              isSelectedLtv(target)
                ? 'bg-river text-accent-contrast'
                : 'text-slate hover:bg-surface hover:text-river'
            "
            :aria-pressed="isSelectedLtv(target)"
            :disabled="ltvReferenceCollateralUsd <= 0"
            :aria-label="`${target}% projected LTV using ${ltvReferenceProvider || 'the highest-capacity pooled path'}`"
            @click="selectLtv(target)"
          >
            {{ target }}%
          </button>
        </div>
      </div>

      <div
        class="mt-5 grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(16rem,0.72fr)_minmax(0,1.28fr)] lg:items-end xl:grid-cols-1 xl:items-stretch"
      >
        <label
          class="block min-w-0 rounded-lg border border-line bg-surface px-4 py-3 focus-within:border-river focus-within:ring-1 focus-within:ring-river"
        >
          <span class="flex items-center justify-between gap-3">
            <span class="type-label text-slate">Borrow amount</span>
            <span class="text-xs font-semibold text-slate">USDC</span>
          </span>
          <span class="mt-1.5 flex items-center gap-2.5">
            <img src="/tokens/usdc.png" alt="" class="h-8 w-8 rounded-full" />
            <span class="text-2xl font-semibold text-slate" aria-hidden="true"
              >$</span
            >
            <input
              :value="amountText"
              type="text"
              inputmode="decimal"
              class="type-data min-w-0 flex-1 bg-transparent text-3xl leading-9 outline-none"
              aria-label="Borrow amount in USDC"
              aria-describedby="comparison-range-note amount-error"
              @input="onTextInput"
              @focus="editing = true"
              @blur="
                editing = false;
                amountText = formatAmount(amount);
              "
            />
          </span>
        </label>

        <div class="min-w-0">
          <div
            class="flex flex-col gap-1 text-sm sm:flex-row sm:items-end sm:justify-between sm:gap-4"
          >
            <span class="font-medium text-slate">Amount range</span>
            <strong class="shrink-0 whitespace-nowrap tabular-nums text-ink"
              >{{ formatUsdValue(comparisonCeilingUsd) }} ceiling</strong
            >
          </div>
          <input
            :value="Math.min(amount, comparisonCeilingUsd)"
            type="range"
            min="0"
            :max="Math.max(comparisonCeilingUsd, 1)"
            :step="amountInputStep(comparisonCeilingUsd)"
            class="amount-range mt-3 block w-full max-w-full"
            :style="{ '--range-progress': `${progress}%` }"
            aria-label="Borrow amount comparison range"
            :aria-valuetext="`${formatUsdValue(amount)} requested; ${formatUsdValue(comparisonCeilingUsd)} comparison ceiling`"
            @input="onRangeInput"
          />
          <div class="mt-2 flex justify-between text-xs text-slate">
            <span>$0</span><span>Ceiling</span>
          </div>
        </div>
      </div>

      <div
        id="comparison-range-note"
        class="mt-5 border-t border-line pt-4 text-xs leading-5 text-slate"
      >
        <p>
          Ceiling uses the higher of selected assets ({{
            formatUsdValue(selectedAssetValueUsd)
          }}) and the highest pooled estimate ({{
            formatUsdValue(providerMaximumUsd)
          }}).
        </p>
        <p class="mt-1">
          For comparison only—not approved credit or a preferred borrowing
          level. The initial 50% LTV is a starting scenario.
        </p>
      </div>
      <p
        v-if="error"
        id="amount-error"
        class="mt-2 text-sm font-medium text-coral"
      >
        {{ error }}
      </p>
      <p class="sr-only" aria-live="polite">
        Borrow amount {{ formatUsdValue(amount) }}.
      </p>
    </div>

    <div class="border-t border-line bg-mist/35 px-5 py-2 sm:px-6">
      <button
        type="button"
        class="focus-ring inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-river hover:bg-info-surface"
        @click="emit('back')"
      >
        <PhArrowLeft :size="16" aria-hidden="true" />
        Back to assets
      </button>
    </div>
  </section>
</template>
