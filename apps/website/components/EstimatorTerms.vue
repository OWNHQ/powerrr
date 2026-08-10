<script setup lang="ts">
import { PhArrowLeft } from "@phosphor-icons/vue";
import type { RawAmount } from "@powerrr/shared-types";
import {
  formatRawAmountFixed,
  parseUsdcAmount,
  rawAmountToNumber,
} from "@powerrr/math";
import { amountInputStep, formatUsdValue } from "../utils/estimator-ux";
import {
  amountForBorrowIntent,
  relativeIntentForAmount,
  type BorrowAmountIntent,
} from "../utils/borrow-amount-intent";

const props = defineProps<{
  comparisonCeiling: RawAmount;
  error: string;
}>();

const emit = defineEmits<{
  back: [];
  "intent-change": [intent: BorrowAmountIntent];
  "validation-error": [message: string];
}>();
const amount = defineModel<RawAmount>("amount", { required: true });
const editing = ref(false);
const inputValid = ref(true);
const utilizationTargets = [25, 50, 75] as const;
const amountText = ref(formatAmount(amount.value));
const amountUsd = computed(() => rawAmountToNumber(amount.value));
const comparisonCeilingUsd = computed(() =>
  rawAmountToNumber(props.comparisonCeiling),
);
const progress = computed(() =>
  comparisonCeilingUsd.value > 0
    ? Math.min(100, (amountUsd.value / comparisonCeilingUsd.value) * 100)
    : 0,
);
const capacityUtilizationPercent = computed(() => {
  if (comparisonCeilingUsd.value <= 0) return null;
  return (amountUsd.value / comparisonCeilingUsd.value) * 100;
});

watch(amount, (value) => {
  inputValid.value = true;
  emit("validation-error", "");
  if (!editing.value) amountText.value = formatAmount(value);
});

function formatAmount(value: RawAmount): string {
  return formatRawAmountFixed(value, 2);
}

function onTextInput(event: Event): void {
  amountText.value = (event.target as HTMLInputElement).value;
  emit("intent-change", { kind: "absolute" });
  const parsed = parseUsdcAmount(amountText.value);
  inputValid.value = parsed.ok;
  emit("validation-error", parsed.ok ? "" : parsed.message);
  if (parsed.ok) amount.value = parsed.amount;
}

function onRangeInput(event: Event): void {
  const parsed = parseUsdcAmount((event.target as HTMLInputElement).value);
  if (parsed.ok) {
    amount.value = parsed.amount;
    emit(
      "intent-change",
      relativeIntentForAmount(amount.value, props.comparisonCeiling),
    );
  }
}

function onBlur(): void {
  editing.value = false;
  if (inputValid.value) amountText.value = formatAmount(amount.value);
}

function selectUtilization(targetPercent: number): void {
  const intent: BorrowAmountIntent = {
    kind: "relative",
    utilizationPercent: targetPercent,
  };
  emit("intent-change", intent);
  amount.value = amountForBorrowIntent(
    intent,
    props.comparisonCeiling,
    amount.value,
  );
}

function isSelectedUtilization(targetPercent: number): boolean {
  return (
    capacityUtilizationPercent.value !== null &&
    Math.abs(capacityUtilizationPercent.value - targetPercent) < 0.05
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
        <div class="flex items-center justify-between gap-4">
          <h3 class="text-sm font-semibold">Capacity utilization</h3>
          <strong
            v-if="capacityUtilizationPercent !== null"
            class="type-data shrink-0 text-base text-ink"
          >
            {{ capacityUtilizationPercent.toFixed(1) }}%
          </strong>
        </div>
        <div
          class="mt-3 grid grid-cols-3 gap-1 rounded-lg border border-line bg-mist/55 p-1"
          role="group"
          aria-label="Set borrow amount by capacity utilization"
        >
          <button
            v-for="target in utilizationTargets"
            :key="target"
            type="button"
            class="focus-ring min-h-10 rounded-md px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45"
            :class="
              isSelectedUtilization(target)
                ? 'bg-river text-accent-contrast'
                : 'text-slate hover:bg-surface hover:text-river'
            "
            :aria-pressed="isSelectedUtilization(target)"
            :disabled="comparisonCeilingUsd <= 0"
            :aria-label="`${target}% capacity utilization`"
            @click="selectUtilization(target)"
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
              :aria-invalid="!inputValid"
              :aria-describedby="error ? 'amount-error' : undefined"
              @input="onTextInput"
              @focus="editing = true"
              @blur="onBlur"
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
            :value="Math.min(amountUsd, comparisonCeilingUsd)"
            type="range"
            min="0"
            :max="comparisonCeilingUsd > 0 ? comparisonCeilingUsd : 1"
            :step="amountInputStep(comparisonCeilingUsd)"
            :disabled="comparisonCeilingUsd <= 0"
            class="amount-range mt-3 block w-full max-w-full"
            :style="{ '--range-progress': `${progress}%` }"
            aria-label="Borrow amount comparison range"
            :aria-valuetext="`${formatUsdValue(amountUsd)} requested; ${formatUsdValue(comparisonCeilingUsd)} comparison ceiling`"
            @input="onRangeInput"
          />
          <div class="mt-2 flex justify-between text-xs text-slate">
            <span>$0</span><span>Ceiling</span>
          </div>
        </div>
      </div>

      <p
        v-if="error"
        id="amount-error"
        class="mt-2 text-sm font-medium text-coral"
      >
        {{ error }}
      </p>
      <p class="sr-only" aria-live="polite">
        Borrow amount {{ formatUsdValue(amountUsd) }}.
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
