<script setup lang="ts">
import type { CollateralCoverageSummary } from "../utils/estimator-ux";
import { formatUsdValue } from "../utils/estimator-ux";

const props = defineProps<CollateralCoverageSummary>();

const coverageCopy = computed(() => {
  if (props.sourceStatus === "unavailable") {
    return "Pooled collateral coverage could not be checked. Refresh before relying on this comparison.";
  }
  if ((props.gapValueUsd ?? 0) > 0) {
    return `${formatUsdValue(props.gapValueUsd)} of selected collateral is not included in any currently available pooled estimate. Direct assessments may consider assets outside these protocol models.`;
  }
  return "All selected collateral is included by at least one currently available pooled estimate.";
});
</script>

<template>
  <section
    class="overflow-hidden rounded-xl border border-line bg-surface"
    aria-labelledby="collateral-coverage-title"
    data-collateral-coverage
  >
    <div class="px-4 py-4 sm:px-5">
      <h3 id="collateral-coverage-title" class="font-semibold">
        Collateral coverage
      </h3>
      <dl
        class="mt-3 grid grid-cols-1 divide-y divide-line text-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0"
      >
        <div class="min-w-0 py-2 sm:py-0 sm:pr-4">
          <dt class="type-metric-label text-slate">Selected priced value</dt>
          <dd class="type-data mt-1 break-words" data-coverage-selected>
            {{ formatUsdValue(selectedValueUsd) }}
          </dd>
        </div>
        <div class="min-w-0 py-2 sm:px-4 sm:py-0">
          <dt class="type-metric-label text-slate">Modeled collateral value</dt>
          <dd class="type-data mt-1 break-words" data-coverage-modeled>
            {{ formatUsdValue(modeledValueUsd) }}
          </dd>
        </div>
        <div class="min-w-0 py-2 sm:py-0 sm:pl-4">
          <dt class="type-metric-label text-slate">Not included</dt>
          <dd class="type-data mt-1 break-words" data-coverage-gap>
            {{ formatUsdValue(gapValueUsd) }}
          </dd>
        </div>
      </dl>
    </div>
    <div
      class="border-t border-line bg-mist/30 px-4 py-3 text-xs leading-5 text-slate sm:px-5"
    >
      <p>{{ coverageCopy }}</p>
      <p
        v-if="sourceStatus === 'partial'"
        class="mt-1 font-medium text-warning"
      >
        Some provider sources were unavailable, so pooled coverage may be
        understated.
      </p>
    </div>
  </section>
</template>
