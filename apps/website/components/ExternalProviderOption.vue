<script setup lang="ts">
import type { WebsiteQuoteGroup } from "../utils/quote-row";
import {
  formatUsdValue,
  providerFreshnessLabel,
  providerRateLabel,
} from "../utils/estimator-ux";

type Provider = {
  id: string;
  label: string;
  group?: WebsiteQuoteGroup;
};

const props = defineProps<{
  provider: Provider;
  selected: boolean;
  meetsAmount: boolean;
}>();

const emit = defineEmits<{
  select: [id: string, capacity: number];
}>();

const quote = computed(() => props.provider.group?.primaryQuote);
const capacity = computed(() => quote.value?.safeBorrowUsd ?? 0);
const availabilityLabel = computed(() =>
  quote.value ? "Below requested amount" : "Unavailable",
);
const stale = computed(
  () =>
    Boolean(quote.value?.stale) ||
    Boolean(
      quote.value?.provenance.some(
        (provenance) => provenance.freshnessStatus === "stale",
      ),
    ),
);

function collateralLabel(): string {
  const count = quote.value?.collateralUsed.length ?? 0;
  return `${count} ${count === 1 ? "asset" : "assets"} in estimate`;
}
</script>

<template>
  <button
    type="button"
    role="radio"
    class="focus-ring min-h-40 rounded-xl border bg-surface p-4 text-left transition"
    :class="
      !meetsAmount
        ? 'cursor-not-allowed border-line bg-mist/45 opacity-55 shadow-inner'
        : selected
          ? 'border-river ring-1 ring-river'
          : 'border-line hover:border-river/60'
    "
    :aria-checked="selected"
    :aria-disabled="!meetsAmount"
    :disabled="!meetsAmount"
    @click="emit('select', provider.id, capacity)"
  >
    <span class="flex items-start justify-between gap-3">
      <span class="flex items-center gap-2">
        <span
          data-selection-indicator
          class="grid h-5 w-5 place-items-center rounded-full border"
          :class="selected ? 'border-river' : 'border-slate/40'"
        >
          <span
            v-if="selected"
            class="h-2.5 w-2.5 rounded-full bg-river"
          ></span>
        </span>
        <strong data-provider-label>{{ provider.label }}</strong>
      </span>
      <span
        v-if="!meetsAmount"
        class="max-w-28 rounded bg-slate/10 px-2 py-1 text-right text-xs font-bold uppercase leading-4 text-slate"
      >
        {{ availabilityLabel }}
      </span>
    </span>
    <span class="type-label mt-6 block text-slate">{{
      quote ? "Estimated provider limit" : "Provider limit"
    }}</span>
    <strong class="type-data mt-1 block text-xl">{{
      quote ? formatUsdValue(capacity) : "—"
    }}</strong>
    <span
      v-if="quote"
      class="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-3 text-xs leading-5 text-slate"
    >
      <span>{{ providerRateLabel(quote) }}</span>
      <span class="text-right">{{ collateralLabel() }}</span>
      <span v-if="stale" class="col-span-2 font-medium text-warning">{{
        providerFreshnessLabel(quote)
      }}</span>
    </span>
    <span
      v-else
      class="mt-4 block border-t border-line pt-3 text-xs leading-5 text-slate"
    >
      No capacity for the selected collateral.
    </span>
  </button>
</template>
