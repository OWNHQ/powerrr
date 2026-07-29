<script setup lang="ts">
import { amountForUtilization, formatUsdValue } from "../utils/estimator-ux";

const props = defineProps<{
  providerMaximumUsd: number;
  ownPotentialUsd: number;
  error: string;
}>();

const emit = defineEmits<{
  back: [];
  continue: [];
}>();

const amount = defineModel<number>("amount", { required: true });
const shortcutPercents = [25, 50, 75, 100] as const;
const maximumRequestableUsd = computed(() =>
  Math.max(props.providerMaximumUsd, props.ownPotentialUsd),
);
const selectedPercent = computed(() => {
  if (maximumRequestableUsd.value <= 0) return null;
  return (
    shortcutPercents.find(
      (percent) =>
        amount.value ===
        amountForUtilization(maximumRequestableUsd.value, percent),
    ) ?? null
  );
});
const editing = ref(false);
const amountText = ref(formatAmount(amount.value));

watch(amount, (value) => {
  if (!editing.value) amountText.value = formatAmount(value);
});

function formatAmount(value: number): string {
  if (value <= 0) return "";
  const fractionDigits =
    maximumRequestableUsd.value < 1
      ? 6
      : maximumRequestableUsd.value < 100
        ? 2
        : 0;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function onInput(event: Event): void {
  amountText.value = (event.target as HTMLInputElement).value;
  const value = Number(amountText.value.replaceAll(",", "").replace("$", ""));
  amount.value = Number.isFinite(value) ? Math.max(0, value) : 0;
}

function onFocus(): void {
  editing.value = true;
}

function onBlur(): void {
  editing.value = false;
  amountText.value = formatAmount(amount.value);
}

function choosePercent(percent: number): void {
  amount.value = amountForUtilization(maximumRequestableUsd.value, percent);
}
</script>

<template>
  <section class="panel overflow-hidden" aria-labelledby="terms-title">
    <div class="border-b border-line px-5 py-5 sm:px-6">
      <p class="text-xs font-bold uppercase tracking-[0.14em] text-river">
        Step 2 of 3
      </p>
      <h2 id="terms-title" class="mt-1 text-xl font-semibold">
        Set your borrowing amount
      </h2>
      <p class="mt-1 max-w-2xl text-sm leading-6 text-slate">
        Enter the amount of USDC you want to borrow.
      </p>
    </div>

    <div
      class="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.72fr)] lg:items-start"
    >
      <div>
        <label
          class="block rounded-xl border border-line bg-surface px-4 py-4 focus-within:border-river focus-within:ring-1 focus-within:ring-river"
        >
          <span
            class="text-xs font-semibold uppercase tracking-[0.1em] text-slate"
          >
            Borrow amount
          </span>
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
              placeholder="0"
              aria-label="Borrow amount in USDC"
              aria-describedby="provider-availability own-potential amount-error"
              @input="onInput"
              @focus="onFocus"
              @blur="onBlur"
            />
            <span class="text-sm font-semibold text-slate">USDC</span>
          </span>
        </label>
        <p id="provider-availability" class="mt-3 text-sm text-slate">
          Estimated provider limit: up to
          <strong class="font-semibold text-ink">{{
            formatUsdValue(providerMaximumUsd)
          }}</strong>
        </p>
        <p id="own-potential" class="mt-1 text-sm text-slate">
          OWN fixed-term capacity is not published while its production policy
          is under review.
        </p>
        <p
          v-if="error"
          id="amount-error"
          class="mt-2 text-sm font-medium text-coral"
        >
          {{ error }}
        </p>
      </div>

      <div class="rounded-xl border border-line bg-mist/45 p-4">
        <p class="text-sm font-semibold">Amount shortcuts</p>
        <p class="mt-1 text-xs leading-5 text-slate">
          Based on the largest displayed estimate. Availability depends on the
          path you choose next.
        </p>
        <div class="mt-4 grid grid-cols-2 gap-2">
          <button
            v-for="percent in shortcutPercents"
            :key="percent"
            type="button"
            class="focus-ring min-h-14 rounded-lg border px-3 py-2 text-sm font-semibold transition"
            :class="
              selectedPercent === percent
                ? 'border-river bg-info-surface text-river ring-1 ring-river/25'
                : 'border-line bg-surface hover:border-river'
            "
            :disabled="maximumRequestableUsd <= 0"
            :aria-pressed="selectedPercent === percent"
            @click="choosePercent(percent)"
          >
            <span class="flex items-center justify-center gap-1.5">
              <span>{{ percent }}%</span>
              <span
                v-if="selectedPercent === percent"
                class="h-1.5 w-1.5 rounded-full bg-river"
                aria-hidden="true"
              ></span>
            </span>
            <span
              class="mt-0.5 block text-xs font-medium tabular-nums text-slate"
            >
              {{
                formatUsdValue(
                  amountForUtilization(maximumRequestableUsd, percent),
                )
              }}
            </span>
          </button>
        </div>
      </div>
    </div>

    <div
      class="flex items-center justify-between gap-3 border-t border-line bg-mist/35 px-5 py-4 sm:px-6"
    >
      <button
        type="button"
        class="focus-ring min-h-11 rounded-lg px-4 text-sm font-semibold text-river hover:bg-info-surface"
        @click="emit('back')"
      >
        Back to assets
      </button>
      <button
        type="button"
        class="focus-ring min-h-12 rounded-lg bg-river px-6 text-sm font-semibold text-accent-contrast hover:bg-river/90"
        @click="emit('continue')"
      >
        Compare borrowing paths
      </button>
    </div>
  </section>
</template>
