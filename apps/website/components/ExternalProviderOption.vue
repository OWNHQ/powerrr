<script setup lang="ts">
import type { ProtocolAvailability } from "@powerrr/shared-types";
import type { WebsiteQuoteGroup } from "../utils/quote-row";
import {
  formatUsdValue,
  providerAvailabilityMessage,
  providerFreshnessLabel,
} from "../utils/estimator-ux";

type Provider = {
  id: string;
  label: string;
  group?: WebsiteQuoteGroup;
  availability?: ProtocolAvailability;
};

const props = defineProps<{
  provider: Provider;
  selected: boolean;
  highestCapacity: boolean;
}>();

const emit = defineEmits<{
  select: [id: string, capacity: number];
}>();

const quote = computed(() => props.provider.group?.primaryQuote);
const capacity = computed(() => quote.value?.safeBorrowUsd ?? 0);

function rateLabel(): string {
  if (!quote.value) return "";
  const rate = quote.value.annualRate;
  return `${formatPercent(rate?.value ?? quote.value.indicativeApr)} ${quote.value.rateType} ${(rate?.convention ?? "apr").toUpperCase()}`;
}

function collateralLabel(): string {
  const count = quote.value?.collateralUsed.length ?? 0;
  return `${count} matched ${count === 1 ? "asset" : "assets"}`;
}

function sourceLabel(): string {
  const provenance = quote.value?.provenance[0];
  if (!provenance) return "Source unavailable";
  if (provenance.sourceType === "on-chain") return "On-chain source";
  if (provenance.sourceType === "official-api") return "Official API";
  return provenance.sourceType === "fixture"
    ? "Demo source"
    : "Estimated source";
}

function unavailableLabel(): string {
  if (props.provider.availability?.status === "unavailable") {
    return providerAvailabilityMessage(props.provider.availability.reason);
  }
  return "No eligible collateral";
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}
</script>

<template>
  <button
    type="button"
    role="radio"
    class="focus-ring min-h-40 rounded-xl border bg-white p-4 text-left transition"
    :class="[
      selected
        ? 'border-river ring-1 ring-river'
        : 'border-line hover:border-river/60',
      !provider.group ? 'cursor-not-allowed opacity-65' : '',
    ]"
    :aria-checked="selected"
    :disabled="!provider.group"
    @click="emit('select', provider.id, capacity)"
  >
    <span class="flex items-start justify-between gap-3">
      <span class="flex items-center gap-2">
        <span
          class="grid h-5 w-5 place-items-center rounded-full border"
          :class="selected ? 'border-river' : 'border-slate/40'"
        >
          <span
            v-if="selected"
            class="h-2.5 w-2.5 rounded-full bg-river"
          ></span>
        </span>
        <strong>{{ provider.label }}</strong>
      </span>
      <span
        v-if="highestCapacity"
        class="max-w-28 rounded bg-blue-50 px-2 py-1 text-right text-xs font-bold uppercase leading-4 text-river"
      >
        Highest capacity
      </span>
    </span>
    <template v-if="provider.group && quote">
      <span
        class="mt-6 block text-xs font-medium uppercase tracking-wide text-slate"
        >Estimated borrowing power</span
      >
      <strong class="mt-1 block tabular-nums text-xl tracking-tight">{{
        formatUsdValue(capacity)
      }}</strong>
      <span
        class="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-3 text-xs leading-5 text-slate"
      >
        <span>{{ rateLabel() }}</span>
        <span class="text-right">{{ collateralLabel() }}</span>
        <span>{{ providerFreshnessLabel(quote) }}</span>
        <span class="text-right capitalize"
          >{{ quote.confidence }} confidence</span
        >
        <span
          class="col-span-2 border-t border-line/70 pt-2"
          :title="quote.provenance[0]?.source"
        >
          {{ sourceLabel() }}
        </span>
      </span>
    </template>
    <span v-else class="mt-6 block text-sm leading-6 text-slate">{{
      unavailableLabel()
    }}</span>
  </button>
</template>
