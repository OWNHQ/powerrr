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
    class="overflow-hidden rounded-xl border border-line bg-surface"
  >
    <button
      type="button"
      class="focus-ring w-full px-4 py-4 text-left sm:px-5"
      :aria-expanded="expanded"
      aria-controls="own-comparison-details"
      @click="emit('toggle')"
    >
      <span class="flex items-start justify-between gap-4">
        <span>
          <strong class="block text-base">OWN</strong>
          <span class="mt-1 block text-xs font-semibold text-own"
            >Direct borrowing assessment</span
          >
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
          ><span class="block text-xs text-slate">Asset scope</span
          ><strong>Any asset considered</strong></span
        >
        <span
          ><span class="block text-xs text-slate">Loan structure</span
          ><strong>Fixed term</strong></span
        >
        <span
          ><span class="block text-xs text-slate">Quote</span
          ><strong>Direct from OWN</strong></span
        >
        <span
          ><span class="block text-xs text-slate">Next step</span
          ><strong>Discuss with OWN</strong></span
        >
      </span>
    </button>

    <div
      v-if="expanded"
      id="own-comparison-details"
      class="border-t border-line px-4 py-5 sm:px-5"
    >
      <h3 class="font-semibold">A direct route for non-standard collateral</h3>
      <p class="mt-1 max-w-3xl text-sm leading-6 text-slate">
        OWN can consider any wallet asset, including collateral that pooled
        protocols do not support or cannot price. You discuss the request
        directly with OWN, then receive a proposal stating the accepted
        collateral, loan size, interest, term, and default or liquidation terms
        before deciding whether to proceed. Powerrr does not pre-approve or
        estimate those terms.
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
            <strong class="block text-own">Can be submitted to OWN</strong>
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
          Discuss this request with OWN
          <PhArrowSquareOut :size="17" aria-hidden="true" />
        </a>
      </div>
    </div>
  </article>
</template>
