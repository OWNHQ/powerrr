<script setup lang="ts">
import { PhCheck, PhCoins } from "@phosphor-icons/vue";
import { ethereumAssetMetadataByAddress } from "@powerrr/configs";
import type { PortfolioAsset } from "@powerrr/shared-types";
import { formatUsdValue } from "../utils/estimator-ux";

const props = defineProps<{
  assets: PortfolioAsset[];
  selectedTokens: string[];
  loading: boolean;
}>();

const emit = defineEmits<{
  changeAddress: [];
  toggle: [token: string, selected: boolean];
  continue: [];
}>();

function isSelected(asset: PortfolioAsset): boolean {
  return props.selectedTokens.some(
    (token) => token.toLowerCase() === asset.token.toLowerCase(),
  );
}

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

function eligibleProviderLabel(asset: PortfolioAsset): string {
  const count = eligibleProviderCount(asset);
  return `${count} ${count === 1 ? "provider" : "providers"}`;
}

function assetIcon(asset: PortfolioAsset): string | null {
  const iconKey = ethereumAssetMetadataByAddress(asset.token)?.iconKey;
  return iconKey ? `/tokens/${iconKey}.png` : null;
}

function formatBalance(asset: PortfolioAsset): string {
  const value = Number(asset.balance);
  if (!Number.isFinite(value)) return asset.balance;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value < 0.01 ? 6 : 4,
  }).format(value);
}
</script>

<template>
  <section class="panel overflow-hidden" aria-labelledby="assets-title">
    <div class="border-b border-line px-5 py-5 sm:px-6">
      <div>
        <p class="text-xs font-bold uppercase tracking-[0.14em] text-river">
          Step 1 of 3
        </p>
        <h2 id="assets-title" class="mt-1 text-xl font-semibold">
          Choose collateral
        </h2>
      </div>
    </div>

    <div
      v-if="assets.length"
      class="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-3"
    >
      <button
        v-for="asset in assets"
        :key="asset.token"
        type="button"
        class="focus-ring relative flex min-h-32 items-center gap-4 rounded-xl border p-4 text-left transition"
        :class="
          isSelected(asset)
            ? 'border-river bg-info-surface ring-1 ring-river'
            : 'border-line bg-surface hover:border-river/60'
        "
        :aria-pressed="isSelected(asset)"
        @click="emit('toggle', asset.token, !isSelected(asset))"
      >
        <span
          class="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full border"
          :class="
            isSelected(asset)
              ? 'border-river bg-river text-accent-contrast'
              : 'border-slate/35 bg-surface text-transparent'
          "
          aria-hidden="true"
        >
          <PhCheck :size="14" weight="bold" />
        </span>
        <img
          v-if="assetIcon(asset)"
          :src="assetIcon(asset) ?? undefined"
          :alt="asset.symbol"
          class="h-11 w-11 shrink-0 rounded-full"
        />
        <span
          v-else
          class="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-mist text-river"
        >
          <PhCoins :size="24" aria-hidden="true" />
        </span>
        <span class="min-w-0 pr-6">
          <strong class="block text-base">{{ asset.symbol }}</strong>
          <span class="mt-1 block text-sm tabular-nums text-slate">
            {{ formatBalance(asset) }} ·
            {{ formatUsdValue(assetValueUsd(asset)) }}
          </span>
          <span class="mt-1 block text-xs text-slate">
            {{ eligibleProviderLabel(asset) }}
            <template v-if="asset.requiredAction === 'wrap'">
              · conversion required</template
            >
          </span>
        </span>
      </button>
    </div>

    <div v-else class="px-5 py-12 text-center sm:px-6">
      <h3 class="font-semibold">No provider-matched collateral found</h3>
      <p class="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate">
        The supported assets at this public address do not match the current
        USDC collateral rules used by the compared providers.
      </p>
      <button
        type="button"
        class="focus-ring mt-5 min-h-11 rounded-lg border border-line px-4 text-sm font-semibold text-river hover:border-river"
        @click="emit('changeAddress')"
      >
        Try another address
      </button>
    </div>

    <div
      v-if="assets.length"
      class="flex flex-col gap-4 border-t border-line bg-mist/35 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
    >
      <p class="text-sm text-slate">
        <strong class="font-semibold text-ink">{{
          selectedTokens.length
        }}</strong>
        {{ selectedTokens.length === 1 ? "asset" : "assets" }} selected
      </p>
      <button
        type="button"
        class="focus-ring min-h-12 rounded-lg bg-river px-6 text-sm font-semibold text-accent-contrast hover:bg-river/90 disabled:cursor-not-allowed disabled:opacity-45"
        :disabled="!selectedTokens.length || loading"
        @click="emit('continue')"
      >
        {{ loading ? "Recalculating…" : "Continue to amount" }}
      </button>
    </div>
  </section>
</template>
