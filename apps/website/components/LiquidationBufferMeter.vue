<script setup lang="ts">
import type { PooledRiskBand } from "../utils/borrow-preview";
import { liquidationBufferDescription } from "../utils/estimator-ux";

const props = defineProps<{
  id: string;
  healthFactor: number | null;
  riskBand: PooledRiskBand;
  statusLabel: string;
  hideLabelAtWide?: boolean;
}>();

const hasHealthFactor = computed(
  () =>
    props.healthFactor !== null &&
    Number.isFinite(props.healthFactor) &&
    props.healthFactor > 0,
);
const healthFactorLabel = computed(() =>
  hasHealthFactor.value ? props.healthFactor!.toFixed(2) : "—",
);
const toneClass = computed(() => {
  switch (props.riskBand) {
    case "wide":
      return "text-moss";
    case "reduced":
      return "text-gold";
    case "thin":
    case "at-boundary":
    case "above-threshold":
      return "text-coral";
    default:
      return "text-slate";
  }
});
const indicatorClass = computed(() => {
  switch (props.riskBand) {
    case "wide":
      return "bg-moss";
    case "reduced":
      return "bg-gold";
    case "thin":
    case "at-boundary":
    case "above-threshold":
      return "bg-coral";
    default:
      return "bg-line";
  }
});
const bufferDescription = computed(() =>
  liquidationBufferDescription(props.healthFactor),
);
</script>

<template>
  <span
    :id="id"
    class="block min-w-0"
    :class="toneClass"
    data-health-factor
    :data-risk-band="riskBand"
  >
    <span class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <span
        class="type-metric-label text-slate"
        :class="hideLabelAtWide ? 'lg:sr-only' : ''"
        >Buffer at your amount</span
      >
      <span class="flex min-w-0 items-center gap-2">
        <span
          class="h-2.5 w-2.5 shrink-0 rounded-full"
          :class="indicatorClass"
          data-risk-indicator
          aria-hidden="true"
        ></span>
        <strong
          class="type-data text-base text-ink"
          :aria-label="`Health factor ${healthFactorLabel}`"
          >{{ healthFactorLabel }}</strong
        >
        <span class="text-xs font-semibold">{{ statusLabel }}</span>
      </span>
    </span>

    <span class="mt-1 block text-xs leading-4 text-slate">
      {{ bufferDescription }}
    </span>
  </span>
</template>
