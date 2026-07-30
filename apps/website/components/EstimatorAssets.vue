<script setup lang="ts">
import { PhCheck, PhCoins, PhShieldCheck } from "@phosphor-icons/vue";
import { ethereumAssetMetadataByAddress } from "@powerrr/configs";
import type { PortfolioAsset } from "@powerrr/shared-types";
import { formatUsdValue, sortAssetsByUsdValue } from "../utils/estimator-ux";

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
const sortedAssets = computed(() => sortAssetsByUsdValue(props.assets));
const smallAssets = computed(() =>
  sortedAssets.value.filter(
    (asset) => asset.marketPriceUsd && assetValueUsd(asset) < 5,
  ),
);
const unpricedAssets = computed(() =>
  sortedAssets.value.filter((asset) => !asset.marketPriceUsd),
);
const pricedAssets = computed(() =>
  sortedAssets.value.filter((asset) => Boolean(asset.marketPriceUsd)),
);
const regularAssets = computed(() => {
  const regular = pricedAssets.value.filter(
    (asset) => assetValueUsd(asset) >= 5,
  );
  return regular.length ? regular : pricedAssets.value;
});
const hideSmallAssets = computed(
  () =>
    regularAssets.value.length > 0 &&
    regularAssets.value.length < pricedAssets.value.length,
);
const selectedValueUsd = computed(() =>
  props.assets.reduce(
    (sum, asset) =>
      isSelected(asset) && asset.marketPriceUsd
        ? sum + assetValueUsd(asset)
        : sum,
    0,
  ),
);

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
  <section
    class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_20rem]"
    aria-labelledby="assets-title"
  >
    <div class="panel overflow-hidden" data-asset-workspace-main>
      <div
        class="border-b border-line px-5 py-5 sm:flex sm:items-start sm:justify-between sm:gap-8 sm:px-6"
      >
        <div>
          <h2 id="assets-title" class="type-title">Choose collateral</h2>
          <p class="mt-1 max-w-2xl text-sm leading-6 text-slate">
            Priced balances above $5 are selected automatically. Review the set
            before comparing every provider against the same collateral.
          </p>
        </div>
        <p
          v-if="regularAssets.length"
          class="mt-3 shrink-0 text-sm text-slate sm:mt-1 sm:text-right"
        >
          <strong class="font-semibold text-ink tabular-nums">{{
            regularAssets.length
          }}</strong>
          {{ regularAssets.length === 1 ? "priced asset" : "priced assets" }}
          to review
        </p>
      </div>

      <div v-if="!assets.length" class="px-5 py-12 text-center sm:px-6">
        <h3 class="font-semibold">No tracked assets found</h3>
        <p class="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate">
          This address has no positive balances in the reviewed Ethereum token
          registry.
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
        v-if="regularAssets.length"
        class="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-3"
      >
        <button
          v-for="asset in regularAssets"
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
              {{
                asset.marketPriceUsd
                  ? formatUsdValue(assetValueUsd(asset))
                  : "Price unavailable"
              }}
            </span>
            <span class="mt-1 block break-all text-xs leading-5 text-slate">
              {{ asset.priceProvenance ?? "Protocol details explain support" }}
              <template v-if="asset.requiredAction === 'wrap'">
                · conversion required</template
              >
            </span>
          </span>
        </button>
      </div>

      <details
        v-if="hideSmallAssets && smallAssets.length"
        class="border-t border-line"
      >
        <summary
          class="focus-ring cursor-pointer px-5 py-4 text-sm font-semibold sm:px-6"
        >
          Small balances ({{ smallAssets.length }})
        </summary>
        <div
          class="grid gap-3 border-t border-line p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-3"
        >
          <button
            v-for="asset in smallAssets"
            :key="asset.token"
            type="button"
            class="focus-ring rounded-xl border p-4 text-left"
            :class="
              isSelected(asset)
                ? 'border-river bg-info-surface ring-1 ring-river'
                : 'border-line bg-surface hover:border-river/60'
            "
            :aria-pressed="isSelected(asset)"
            @click="emit('toggle', asset.token, !isSelected(asset))"
          >
            <strong>{{ asset.symbol }}</strong>
            <span class="mt-1 block text-sm text-slate"
              >{{ formatBalance(asset) }} ·
              {{ formatUsdValue(assetValueUsd(asset)) }}</span
            >
          </button>
        </div>
      </details>

      <details
        v-if="unpricedAssets.length"
        class="border-t border-line"
        :open="!pricedAssets.length"
      >
        <summary
          class="focus-ring cursor-pointer px-5 py-4 text-sm font-semibold sm:px-6"
        >
          Price unavailable ({{ unpricedAssets.length }})
        </summary>
        <div
          class="grid gap-3 border-t border-line p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-3"
        >
          <button
            v-for="asset in unpricedAssets"
            :key="asset.token"
            type="button"
            class="focus-ring rounded-xl border p-4 text-left"
            :class="
              isSelected(asset)
                ? 'border-river bg-info-surface ring-1 ring-river'
                : 'border-line bg-surface hover:border-river/60'
            "
            :aria-pressed="isSelected(asset)"
            @click="emit('toggle', asset.token, !isSelected(asset))"
          >
            <strong>{{ asset.symbol }}</strong>
            <span class="mt-1 block text-sm text-slate">
              {{ formatBalance(asset) }} · Price unavailable
            </span>
            <span class="mt-1 block text-xs leading-5 text-slate">
              {{
                asset.valuationReason ??
                "No safe onchain USD route was available at the pinned block."
              }}
            </span>
          </button>
        </div>
      </details>
    </div>

    <aside
      v-if="assets.length"
      class="panel p-5 lg:sticky lg:top-24"
      data-selection-summary
      aria-labelledby="selection-summary-title"
    >
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3 id="selection-summary-title" class="type-subtitle">Selection</h3>
          <p class="mt-1 text-sm leading-5 text-slate">
            Used as the same input across every path.
          </p>
        </div>
        <span
          class="grid h-8 w-8 shrink-0 place-items-center rounded-full border"
          :class="
            selectedTokens.length
              ? 'border-river bg-river text-accent-contrast'
              : 'border-line bg-surface text-slate'
          "
          aria-hidden="true"
        >
          <PhCheck :size="16" weight="bold" />
        </span>
      </div>

      <dl class="mt-5 divide-y divide-line border-y border-line text-sm">
        <div class="flex items-center justify-between gap-4 py-3">
          <dt class="text-slate">Assets</dt>
          <dd class="type-data tabular-nums">
            {{ selectedTokens.length }} selected
          </dd>
        </div>
        <div class="flex items-center justify-between gap-4 py-3">
          <dt class="text-slate">Priced value</dt>
          <dd class="type-data tabular-nums">
            {{ formatUsdValue(selectedValueUsd) }}
          </dd>
        </div>
      </dl>

      <p class="mt-4 flex items-start gap-2 text-xs leading-5 text-slate">
        <PhShieldCheck
          :size="18"
          class="mt-0.5 shrink-0 text-moss"
          aria-hidden="true"
        />
        Your selection stays in this browser and can be changed before you
        compare.
      </p>

      <button
        type="button"
        class="focus-ring mt-5 min-h-12 w-full rounded-lg bg-river px-5 text-sm font-semibold text-accent-contrast hover:bg-river/90 disabled:cursor-not-allowed disabled:opacity-45"
        :disabled="!selectedTokens.length || loading"
        @click="emit('continue')"
      >
        {{
          loading
            ? "Recalculating…"
            : `Compare ${selectedTokens.length} selected ${
                selectedTokens.length === 1 ? "asset" : "assets"
              }`
        }}
      </button>
    </aside>
  </section>
</template>
