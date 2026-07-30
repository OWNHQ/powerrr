<script setup lang="ts">
import { formatUsdValue } from "../utils/estimator-ux";

const props = defineProps<{
  selected: boolean;
  amountUsd: number;
  assetCount: number;
}>();

const emit = defineEmits<{
  select: [];
}>();

const collateralLabel = computed(
  () =>
    `${props.assetCount} selected ${props.assetCount === 1 ? "asset" : "assets"}`,
);
</script>

<template>
  <section
    class="mt-5 overflow-hidden rounded-xl border bg-surface transition"
    :class="selected ? 'border-own ring-1 ring-own' : 'border-line'"
    aria-labelledby="own-option-title"
  >
    <button
      type="button"
      role="radio"
      class="focus-ring grid w-full gap-4 px-4 py-4 text-left sm:grid-cols-[minmax(12rem,1.15fr)_minmax(10rem,0.8fr)_minmax(12rem,0.9fr)] sm:items-center"
      :aria-checked="selected"
      aria-label="OWN fixed-term assessment"
      @click="emit('select')"
    >
      <span class="flex min-w-0 items-center gap-3">
        <span
          data-selection-indicator
          class="grid h-5 w-5 shrink-0 place-items-center rounded-full border"
          :class="selected ? 'border-own' : 'border-slate/40'"
        >
          <span v-if="selected" class="h-2.5 w-2.5 rounded-full bg-own"></span>
        </span>
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
        <span class="type-label block text-slate"> Status </span>
        <span class="mt-1 block text-sm font-semibold text-ink">
          {{
            selected ? "Selected for assessment" : "Available for assessment"
          }}
        </span>
        <span class="mt-1 block text-xs text-slate">
          Any selected collateral asset can be reviewed.
        </span>
      </span>

      <span>
        <span class="type-label block text-slate"> Fixed-term route </span>
        <span class="type-data mt-1 block text-lg">
          {{ formatUsdValue(amountUsd) }} requested
        </span>
        <span class="mt-1 block text-xs leading-5 text-slate">
          {{ collateralLabel }} · capacity, terms, and funding require approval.
        </span>
      </span>
    </button>
    <p
      v-if="selected"
      class="border-t border-line bg-ownsoft/55 px-4 py-3 text-xs leading-5 text-slate"
    >
      OWN is selected as the fixed-term assessment path. Selection does not
      publish or imply an approved capacity, rate, repayment total, or funding
      commitment.
    </p>
  </section>
</template>
