<script setup lang="ts">
import type { BorrowOpportunity } from "@powerrr/shared-types";

defineProps<{
  opportunity: BorrowOpportunity;
}>();
</script>

<template>
  <section
    class="mt-5 border-y border-line bg-surface"
    aria-labelledby="own-option-title"
  >
    <div
      class="grid w-full gap-4 rounded-lg px-4 py-4 text-left sm:grid-cols-[minmax(12rem,1.15fr)_minmax(10rem,0.8fr)_minmax(12rem,0.9fr)] sm:items-center"
    >
      <span class="flex min-w-0 items-center gap-3">
        <span class="w-14 shrink-0 text-own">
          <OwnLogo decorative />
        </span>
        <span class="min-w-0">
          <span id="own-option-title" class="block font-semibold">OWN</span>
          <span class="mt-0.5 block text-sm text-slate"
            >Fixed-term borrowing</span
          >
        </span>
      </span>

      <span>
        <span
          class="block text-xs font-medium uppercase tracking-wide text-slate"
        >
          Status
        </span>
        <span class="mt-1 block text-sm font-semibold text-ink">
          Policy review required
        </span>
        <span class="mt-1 block text-xs text-slate">
          Numeric capacity is not published.
        </span>
      </span>

      <span>
        <span
          class="block text-xs font-medium uppercase tracking-wide text-slate"
        >
          Fixed-term route
        </span>
        <span
          class="mt-1 block text-lg font-semibold tabular-nums tracking-tight"
        >
          Request assessment
        </span>
        <span class="mt-1 block text-xs leading-5 text-slate">
          Advance rates, repayment terms, and funding require approval.
        </span>
      </span>
    </div>
  </section>
</template>
