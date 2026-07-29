<script setup lang="ts">
import { amountInputStep, formatUsdValue } from "../utils/estimator-ux";

const props = defineProps<{
  comparisonCeilingUsd: number;
  providerMaximumUsd: number;
  selectedAssetValueUsd: number;
  error: string;
}>();

const emit = defineEmits<{ back: [] }>();
const amount = defineModel<number>("amount", { required: true });
const editing = ref(false);
const amountText = ref(formatAmount(amount.value));
const progress = computed(() =>
  props.comparisonCeilingUsd > 0
    ? Math.min(100, (amount.value / props.comparisonCeilingUsd) * 100)
    : 0,
);

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
</script>

<template>
  <section class="panel overflow-hidden" aria-labelledby="terms-title">
    <div class="border-b border-line px-5 py-5 sm:px-6">
      <p class="text-xs font-bold uppercase tracking-[0.14em] text-river">
        Step 2 of 2
      </p>
      <h2 id="terms-title" class="mt-1 text-xl font-semibold">
        Compare borrowing paths
      </h2>
      <p class="mt-1 max-w-2xl text-sm leading-6 text-slate">
        Set one amount. Every protocol preview below updates against the same
        request.
      </p>
    </div>

    <div class="p-5 sm:p-6">
      <div
        class="grid gap-5 lg:grid-cols-[minmax(16rem,0.72fr)_minmax(0,1.28fr)] lg:items-end"
      >
        <label
          class="block rounded-xl border border-line bg-surface px-4 py-4 focus-within:border-river focus-within:ring-1 focus-within:ring-river"
        >
          <span
            class="text-xs font-semibold uppercase tracking-[0.1em] text-slate"
            >Borrow amount</span
          >
          <span class="mt-2 flex items-center gap-3">
            <img src="/tokens/usdc.png" alt="" class="h-9 w-9 rounded-full" />
            <span class="text-3xl font-semibold text-slate" aria-hidden="true"
              >$</span
            >
            <input
              :value="amountText"
              type="text"
              inputmode="decimal"
              class="min-w-0 flex-1 bg-transparent text-3xl font-semibold tracking-[-0.04em] outline-none"
              aria-label="Borrow amount in USDC"
              aria-describedby="comparison-range-note amount-error"
              @input="onTextInput"
              @focus="editing = true"
              @blur="
                editing = false;
                amountText = formatAmount(amount);
              "
            />
            <span class="text-sm font-semibold text-slate">USDC</span>
          </span>
        </label>

        <div>
          <div class="flex items-end justify-between gap-4 text-sm">
            <span class="text-slate">Comparison range</span>
            <strong class="tabular-nums"
              >{{ formatUsdValue(amount) }} of
              {{ formatUsdValue(comparisonCeilingUsd) }}</strong
            >
          </div>
          <input
            :value="Math.min(amount, comparisonCeilingUsd)"
            type="range"
            min="0"
            :max="Math.max(comparisonCeilingUsd, 1)"
            :step="amountInputStep(comparisonCeilingUsd)"
            class="amount-range mt-4 w-full"
            :style="{ '--range-progress': `${progress}%` }"
            aria-label="Borrow amount comparison range"
            :aria-valuetext="`${formatUsdValue(amount)} requested; ${formatUsdValue(comparisonCeilingUsd)} comparison ceiling`"
            @input="onRangeInput"
          />
          <div class="mt-2 flex justify-between text-xs text-slate">
            <span>$0</span
            ><span>{{ formatUsdValue(comparisonCeilingUsd) }} ceiling</span>
          </div>
        </div>
      </div>

      <p id="comparison-range-note" class="mt-4 text-xs leading-5 text-slate">
        The ceiling is the greater of selected asset value ({{
          formatUsdValue(selectedAssetValueUsd)
        }}) and the highest pooled estimate ({{
          formatUsdValue(providerMaximumUsd)
        }}). It is a comparison range, not approved credit.
      </p>
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

    <div class="border-t border-line bg-mist/35 px-5 py-3 sm:px-6">
      <button
        type="button"
        class="focus-ring min-h-10 rounded-lg px-3 text-sm font-semibold text-river hover:bg-info-surface"
        @click="emit('back')"
      >
        Back to assets
      </button>
    </div>
  </section>
</template>
