<script setup lang="ts">
defineProps<{
  demo: boolean;
  address: string;
  matchedCollateral: string;
  assetCount: number;
  providerCount: number;
  freshness: string;
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
    class="result-summary mb-4 rounded-2xl border border-line bg-white px-5 py-5 shadow-panel sm:px-6"
    aria-labelledby="result-title"
  >
    <div
      class="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"
    >
      <div>
        <p class="text-xs font-bold uppercase tracking-[0.16em] text-river">
          {{
            demo
              ? "Demonstration estimate"
              : "Live Ethereum estimate · public RPC preview"
          }}
        </p>
        <h1
          id="result-title"
          class="mt-2 text-2xl font-semibold tracking-tight"
        >
          Borrowing power for {{ address }}
        </h1>
      </div>
      <dl class="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
        <div class="min-w-24">
          <dt>Matched collateral</dt>
          <dd>{{ matchedCollateral }}</dd>
        </div>
        <div class="min-w-24">
          <dt>Supported assets found</dt>
          <dd>{{ assetCount }}</dd>
        </div>
        <div class="min-w-24">
          <dt>Available options</dt>
          <dd>{{ providerCount }}</dd>
        </div>
        <div class="min-w-40">
          <dt>Data status</dt>
          <dd class="max-w-64 text-sm leading-5">{{ freshness }}</dd>
        </div>
      </dl>
    </div>
  </section>
</template>
