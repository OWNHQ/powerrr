<script setup lang="ts">
import { PhArrowClockwise, PhCheck } from "@phosphor-icons/vue";

defineProps<{
  demo: boolean;
  address: string;
  names: string[];
  matchedCollateral: string;
  assetCount: number;
  selectedAssetCount: number;
  providerCount: number;
  staleLabel: string;
  refreshing: boolean;
  refreshComplete: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
}>();

const root = ref<HTMLElement | null>(null);
defineExpose({
  focus: (options?: FocusOptions) => root.value?.focus(options),
});
</script>

<template>
  <section
    ref="root"
    tabindex="-1"
    class="result-summary rounded-2xl border border-line bg-surface px-5 py-5 shadow-panel sm:px-6"
    aria-labelledby="result-title"
  >
    <div
      class="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"
    >
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h1 id="result-title" class="text-2xl font-semibold tracking-tight">
            Borrowing estimate for
            {{ names.length ? names.join(" · ") : address }}
          </h1>
          <span
            v-if="demo"
            class="rounded-full bg-warning-surface px-2.5 py-1 text-xs font-semibold text-warning"
          >
            Example data
          </span>
        </div>
      </div>

      <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
        <dl class="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 sm:gap-x-7">
          <div class="min-w-0">
            <dt>Eligible collateral</dt>
            <dd class="whitespace-nowrap">{{ matchedCollateral }}</dd>
          </div>
          <div class="min-w-0">
            <dt>Selected assets</dt>
            <dd class="whitespace-nowrap">
              {{ selectedAssetCount }}/{{ assetCount }}
            </dd>
          </div>
          <div class="min-w-0">
            <dt>Provider paths</dt>
            <dd class="whitespace-nowrap">{{ providerCount }}</dd>
          </div>
        </dl>
        <div
          class="flex shrink-0 items-center gap-2 sm:border-l sm:border-line sm:pl-5"
        >
          <button
            type="button"
            class="focus-ring inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold text-river hover:border-river disabled:opacity-55"
            :disabled="refreshing"
            @click="emit('refresh')"
          >
            <PhCheck
              v-if="refreshComplete && !refreshing"
              :size="17"
              weight="bold"
              aria-hidden="true"
            />
            <PhArrowClockwise
              v-else
              :size="17"
              :class="{ 'animate-spin': refreshing }"
              aria-hidden="true"
            />
            {{
              refreshing
                ? "Refreshing"
                : refreshComplete
                  ? "Updated"
                  : "Refresh"
            }}
          </button>
        </div>
      </div>
    </div>

    <p
      v-if="staleLabel"
      class="mt-4 border-t border-line pt-3 text-sm font-medium text-warning"
    >
      {{ staleLabel }}. Refresh to check current capacity and rates.
    </p>
    <p class="sr-only" aria-live="polite">
      {{
        refreshing
          ? "Refreshing estimate"
          : refreshComplete
            ? "Estimate updated with current data"
            : ""
      }}
    </p>
  </section>
</template>
