<script setup lang="ts">
import { PhArrowSquareOut, PhCaretDown, PhCoins } from "@phosphor-icons/vue";
import type { PortfolioAsset } from "@powerrr/shared-types";
import { formatUsdValue } from "../utils/estimator-ux";

defineProps<{
  amountUsd: number;
  assets: PortfolioAsset[];
  selectedTokens: string[];
  expanded: boolean;
}>();

const emit = defineEmits<{ toggle: [] }>();

function assetUsd(asset: PortfolioAsset): number | undefined {
  if (!asset.marketPriceUsd) return undefined;
  return Number(asset.balance) * asset.marketPriceUsd;
}
</script>

<template>
  <article
    data-protocol-id="own"
    class="overflow-hidden rounded-xl border border-own/40 bg-surface"
  >
    <button
      type="button"
      class="focus-ring w-full px-4 py-4 text-left sm:px-5"
      :aria-expanded="expanded"
      aria-controls="own-comparison-details"
      @click="emit('toggle')"
    >
      <span class="flex items-start justify-between gap-4">
        <span class="flex items-center gap-3">
          <span class="w-14 text-own"><OwnLogo decorative /></span>
          <span>
            <strong class="block">OWN</strong>
            <span class="mt-1 block text-xs font-semibold text-own"
              >Available for assessment</span
            >
          </span>
        </span>
        <PhCaretDown
          :size="18"
          class="mt-1 text-slate transition"
          :class="expanded ? 'rotate-180' : ''"
          aria-hidden="true"
        />
      </span>
      <span class="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
        <span
          ><span class="block text-xs text-slate">Requested</span
          ><strong class="tabular-nums">{{
            formatUsdValue(amountUsd)
          }}</strong></span
        >
        <span
          ><span class="block text-xs text-slate">Term</span
          ><strong>Fixed-term review</strong></span
        >
        <span
          ><span class="block text-xs text-slate">Borrow LTV</span
          ><strong>Set in review</strong></span
        >
        <span
          ><span class="block text-xs text-slate">Liquidation</span
          ><strong>Set in review</strong></span
        >
        <span
          ><span class="block text-xs text-slate">Capacity</span
          ><strong>Approval required</strong></span
        >
      </span>
    </button>

    <div
      v-if="expanded"
      id="own-comparison-details"
      class="border-t border-line px-4 py-5 sm:px-5"
    >
      <h3 class="font-semibold">Universal asset assessment</h3>
      <p class="mt-1 max-w-3xl text-sm leading-6 text-slate">
        OWN can review every wallet asset. Capacity, LTV, liquidation terms,
        rate, and funding are determined during underwriting and are not implied
        by this estimator.
      </p>
      <ul class="mt-4 divide-y divide-line rounded-lg border border-line">
        <li
          v-for="asset in assets"
          :key="asset.token"
          class="flex items-center justify-between gap-4 px-3 py-3 text-sm"
        >
          <span class="flex items-center gap-2">
            <span
              class="grid h-8 w-8 place-items-center rounded-full bg-ownsoft text-own"
              ><PhCoins :size="17" aria-hidden="true"
            /></span>
            <span
              ><strong class="block">{{ asset.symbol }}</strong
              ><span class="text-xs text-slate">{{
                assetUsd(asset) === undefined
                  ? "Unpriced"
                  : formatUsdValue(assetUsd(asset) ?? 0)
              }}</span></span
            >
          </span>
          <span class="text-right text-xs">
            <strong class="block text-own">Eligible for assessment</strong>
            <span class="text-slate">{{
              selectedTokens.some(
                (token) => token.toLowerCase() === asset.token.toLowerCase(),
              )
                ? "Selected"
                : "Not selected"
            }}</span>
          </span>
        </li>
      </ul>
      <div class="mt-5 flex justify-end">
        <a
          href="https://own.casa/borrow#contact"
          target="_blank"
          rel="noopener noreferrer"
          class="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-own px-5 text-sm font-semibold text-white hover:bg-own/90"
        >
          Contact OWN
          <PhArrowSquareOut :size="17" aria-hidden="true" />
        </a>
      </div>
    </div>
  </article>
</template>
