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
          <strong class="type-subtitle block">OWN</strong>
          <span class="mt-1 block text-xs font-semibold text-moss"
            >Direct borrowing assessment</span
          >
        </span>
        <PhCaretDown
          :size="18"
          class="mt-1 text-slate transition-transform duration-200"
          :class="expanded ? 'rotate-180' : ''"
          aria-hidden="true"
        />
      </span>
      <span class="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
        <span
          ><span class="type-metric-label block text-slate">Requested</span
          ><strong class="type-data">{{
            formatUsdValue(amountUsd)
          }}</strong></span
        >
        <span
          ><span class="type-metric-label block text-slate">Asset scope</span
          ><strong class="type-value">Any asset considered</strong></span
        >
        <span
          ><span class="type-metric-label block text-slate">Loan structure</span
          ><strong class="type-value">Fixed term</strong></span
        >
        <span
          ><span class="type-metric-label block text-slate">Quote</span
          ><strong class="type-value">Direct from OWN</strong></span
        >
        <span
          ><span class="type-metric-label block text-slate">Next step</span
          ><strong class="type-value">Discuss with OWN</strong></span
        >
      </span>
    </button>

    <div
      class="flex min-h-14 items-center justify-end border-t border-line bg-mist/30 px-4 py-2 sm:px-5"
      data-provider-action
    >
      <a
        href="https://own.casa/borrow#contact"
        target="_blank"
        rel="noopener noreferrer"
        class="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-semibold text-own hover:border-own"
      >
        Discuss this request with OWN
        <PhArrowSquareOut :size="17" aria-hidden="true" />
      </a>
    </div>

    <Transition name="provider-disclosure">
      <div v-if="expanded" class="provider-disclosure" data-provider-disclosure>
        <div class="min-h-0 overflow-hidden">
          <div
            id="own-comparison-details"
            class="border-t border-line px-4 py-5 sm:px-5"
          >
            <ul class="divide-y divide-line rounded-lg border border-line">
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
                  <strong class="block text-moss"
                    >Can be submitted to OWN</strong
                  >
                  <span class="text-slate">{{
                    selectedTokens.some(
                      (token) =>
                        token.toLowerCase() === asset.token.toLowerCase(),
                    )
                      ? "Selected"
                      : "Not selected"
                  }}</span>
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </Transition>
  </article>
</template>
