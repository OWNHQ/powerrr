<script setup lang="ts">
import { PhCheckCircle, PhCoins, PhPencilSimple } from "@phosphor-icons/vue";
import { ethereumAssetMetadataByAddress } from "@powerrr/configs";
import type { PortfolioAsset } from "@powerrr/shared-types";
import { formatUsdValue } from "../utils/estimator-ux";

const props = defineProps<{
  assets: PortfolioAsset[];
  expanded: boolean;
  demo: boolean;
  hasConversions: boolean;
}>();

const emit = defineEmits<{
  changeWallet: [];
  toggleExpanded: [];
}>();

const visibleAssets = computed(() =>
  props.expanded ? props.assets : props.assets.slice(0, 5),
);

function assetValueUsd(asset: PortfolioAsset): number {
  const balance = Number(asset.balance);
  return Number.isFinite(balance) && asset.marketPriceUsd
    ? balance * asset.marketPriceUsd
    : 0;
}

function eligibleProviderCount(asset: PortfolioAsset): number {
  const families = [
    asset.protocolEligible["aave-v3"] || asset.protocolEligible["aave-v4"],
    asset.protocolEligible.sparklend,
    asset.protocolEligible["compound-iii"],
    asset.protocolEligible["morpho-blue"],
  ];
  return families.filter(Boolean).length;
}

function assetIcon(asset: PortfolioAsset): string | null {
  const iconKey = ethereumAssetMetadataByAddress(asset.token)?.iconKey;
  return iconKey ? `/tokens/${iconKey}.png` : null;
}
</script>

<template>
  <section
    id="assets"
    class="panel scroll-mt-36 overflow-hidden"
    aria-labelledby="assets-title"
  >
    <header
      class="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id="assets-title" class="text-lg font-semibold">
          Provider-matched collateral
        </h2>
        <span class="flex items-center gap-1.5 text-sm font-medium text-moss">
          <PhCheckCircle :size="17" weight="fill" aria-hidden="true" />
          {{ assets.length }} matched
          {{ assets.length === 1 ? "asset" : "assets" }}
        </span>
      </div>
      <button
        type="button"
        class="focus-ring flex min-h-11 items-center gap-2 self-start rounded-lg border border-line px-3 py-2 text-sm font-semibold text-river hover:border-river"
        @click="emit('changeWallet')"
      >
        <PhPencilSimple :size="17" aria-hidden="true" /> Change wallet
      </button>
    </header>

    <div
      v-if="assets.length"
      class="grid grid-cols-2 p-3 sm:grid-cols-3 lg:grid-cols-5"
    >
      <article
        v-for="(asset, index) in visibleAssets"
        :key="asset.token"
        class="flex min-w-0 items-center gap-3 border-b border-r border-line px-2 py-4 last:border-r-0 sm:px-3 lg:px-5 lg:py-3"
        :class="!expanded && index === 4 ? 'hidden sm:flex' : ''"
      >
        <img
          v-if="assetIcon(asset)"
          :src="assetIcon(asset) || undefined"
          :alt="`${asset.symbol} icon`"
          class="h-11 w-11 shrink-0 rounded-full object-contain"
        />
        <span
          v-else
          class="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-mist text-slate"
          aria-hidden="true"
          ><PhCoins :size="24"
        /></span>
        <div class="min-w-0">
          <p class="truncate text-sm font-medium text-slate">
            {{ asset.symbol }}
          </p>
          <p class="mt-0.5 tabular-nums text-lg font-semibold tracking-tight">
            {{ formatUsdValue(assetValueUsd(asset)) }}
          </p>
          <p class="mt-0.5 text-xs text-slate">
            {{ eligibleProviderCount(asset) }} providers
          </p>
        </div>
      </article>
    </div>
    <div
      v-if="assets.length > 4 || expanded"
      class="border-t border-line px-5 py-3"
      :class="assets.length === 5 && !expanded ? 'sm:hidden' : ''"
    >
      <button
        type="button"
        class="focus-ring min-h-11 rounded-lg px-3 text-sm font-semibold text-river hover:bg-blue-50"
        :aria-expanded="expanded"
        @click="emit('toggleExpanded')"
      >
        {{ expanded ? "Show key assets" : `View all ${assets.length} assets` }}
      </button>
    </div>
    <div v-if="!assets.length" class="px-5 py-10 text-center">
      <h3 class="font-semibold">No provider-matched collateral</h3>
      <p class="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate">
        None of the supported wallet assets matched an available provider’s
        current USDC collateral rules. Other wallet tokens are not indexed.
      </p>
      <button
        type="button"
        class="focus-ring mt-5 min-h-11 rounded-lg border border-line px-4 text-sm font-semibold text-river hover:border-river"
        @click="emit('changeWallet')"
      >
        Try another wallet
      </button>
    </div>
    <details
      class="estimate-details border-t border-line bg-mist/45 px-5 py-3 text-xs leading-5 text-slate"
    >
      <summary
        class="focus-ring min-h-11 cursor-pointer rounded-md py-2 font-semibold text-ink"
      >
        About this estimate
      </summary>
      <div class="max-w-5xl pb-2">
        <p v-if="hasConversions">
          Some providers may require converting ETH or stETH before use.
        </p>
        <p :class="{ 'mt-2': hasConversions }">
          {{
            demo
              ? "This view uses demonstration data."
              : "This preview uses live on-chain and official provider sources through public infrastructure with no availability guarantee."
          }}
          Rates and capacity are point-in-time estimates, not executable quotes.
          Unsupported wallet holdings are intentionally omitted.
        </p>
      </div>
    </details>
  </section>
</template>
