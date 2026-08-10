<script setup lang="ts">
import {
  PhArrowSquareOut,
  PhCheck,
  PhCoins,
  PhCopy,
  PhInfo,
  PhShieldCheck,
  PhX,
} from "@phosphor-icons/vue";
import { ethereumAssetMetadataByAddress } from "@powerrr/configs";
import type { PortfolioAsset } from "@powerrr/shared-types";
import {
  formatUsdValue,
  isAssetSelectable,
  sortAssetsByUsdValue,
} from "../utils/estimator-ux";

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

const openPriceSourceToken = ref("");
const copiedPriceSourceToken = ref("");
const failedPriceSourceToken = ref("");

function assetKey(asset: PortfolioAsset): string {
  return asset.token.toLowerCase();
}

function priceSourceAddress(asset: PortfolioAsset): string | null {
  return asset.priceProvenance?.match(/0x[a-fA-F0-9]{40}/)?.[0] ?? null;
}

function priceSourceExplorerUrl(asset: PortfolioAsset): string | null {
  const address = priceSourceAddress(asset);
  return address ? `https://etherscan.io/address/${address}` : null;
}

function isPriceSourceOpen(asset: PortfolioAsset): boolean {
  return openPriceSourceToken.value === assetKey(asset);
}

function priceSourceTriggerId(asset: PortfolioAsset): string {
  return `price-source-trigger-${asset.token}`;
}

function priceSourceCloseId(asset: PortfolioAsset): string {
  return `price-source-close-${asset.token}`;
}

function closePriceSource(
  asset: PortfolioAsset,
  restoreTriggerFocus = false,
): void {
  if (!isPriceSourceOpen(asset)) return;
  openPriceSourceToken.value = "";
  copiedPriceSourceToken.value = "";
  failedPriceSourceToken.value = "";
  if (restoreTriggerFocus) {
    nextTick(() =>
      document.getElementById(priceSourceTriggerId(asset))?.focus(),
    );
  }
}

function openPriceSource(asset: PortfolioAsset): void {
  const key = assetKey(asset);
  openPriceSourceToken.value = key;
  copiedPriceSourceToken.value = "";
  failedPriceSourceToken.value = "";
  nextTick(() => document.getElementById(priceSourceCloseId(asset))?.focus());
}

async function copyPriceSource(asset: PortfolioAsset): Promise<void> {
  const key = assetKey(asset);
  const value =
    priceSourceAddress(asset) ??
    asset.priceProvenance ??
    "Protocol details explain support";
  try {
    await navigator.clipboard.writeText(value);
    copiedPriceSourceToken.value = key;
    failedPriceSourceToken.value = "";
  } catch {
    copiedPriceSourceToken.value = "";
    failedPriceSourceToken.value = key;
  }
}

function closePriceSourceOnOutsideClick(event: PointerEvent): void {
  const target = event.target;
  if (target instanceof Element && target.closest("[data-price-source]"))
    return;
  openPriceSourceToken.value = "";
}

onMounted(() =>
  document.addEventListener("pointerdown", closePriceSourceOnOutsideClick),
);
onBeforeUnmount(() =>
  document.removeEventListener("pointerdown", closePriceSourceOnOutsideClick),
);

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
    (asset) => isAssetSelectable(asset) && assetValueUsd(asset) < 5,
  ),
);
const unpricedAssets = computed(() =>
  sortedAssets.value.filter(
    (asset) =>
      asset.balanceReadStatus === "success" && !isAssetSelectable(asset),
  ),
);
const failedBalanceAssets = computed(() =>
  sortedAssets.value.filter(
    (asset) =>
      asset.balanceReadStatus === "failed" && BigInt(asset.balanceRaw) === 0n,
  ),
);
const failedMetadataAssets = computed(() =>
  sortedAssets.value.filter(
    (asset) =>
      asset.balanceReadStatus === "failed" && BigInt(asset.balanceRaw) > 0n,
  ),
);
const pricedAssets = computed(() =>
  sortedAssets.value.filter((asset) => isAssetSelectable(asset)),
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
    <div class="contents lg:grid lg:gap-4">
      <div
        class="panel order-1 overflow-hidden lg:order-none"
        data-asset-workspace-main
      >
        <div
          class="border-b border-line px-5 py-5 sm:flex sm:items-start sm:justify-between sm:gap-8 sm:px-6"
        >
          <div>
            <h2 id="assets-title" class="type-title">Choose collateral</h2>
            <p class="mt-1 max-w-2xl text-sm leading-6 text-slate">
              Priced balances above $5 are selected automatically.
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
          class="grid gap-2.5 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3"
        >
          <div
            v-for="asset in regularAssets"
            :key="asset.token"
            class="relative min-h-20 rounded-xl"
            :data-collateral-asset="asset.symbol"
          >
            <button
              type="button"
              class="focus-ring absolute inset-0 rounded-xl border text-left transition"
              :class="
                isSelected(asset)
                  ? 'border-river bg-info-surface ring-1 ring-river'
                  : 'border-line bg-surface hover:border-river/60'
              "
              :aria-label="`${isSelected(asset) ? 'Remove' : 'Add'} ${asset.symbol} ${isSelected(asset) ? 'from' : 'to'} collateral selection`"
              :aria-pressed="isSelected(asset)"
              @click="
                openPriceSourceToken = '';
                emit('toggle', asset.token, !isSelected(asset));
              "
            />
            <span
              class="pointer-events-none absolute right-2.5 top-2.5 z-10 grid h-5 w-5 place-items-center rounded-full border"
              :class="
                isSelected(asset)
                  ? 'border-river bg-river text-accent-contrast'
                  : 'border-slate/35 bg-surface text-transparent'
              "
              aria-hidden="true"
            >
              <PhCheck :size="12" weight="bold" />
            </span>
            <span
              class="pointer-events-none relative flex min-h-20 items-center gap-3 p-3"
            >
              <img
                v-if="assetIcon(asset)"
                :src="assetIcon(asset) ?? undefined"
                :alt="asset.symbol"
                class="h-9 w-9 shrink-0 rounded-full"
              />
              <span
                v-else
                class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-mist text-river"
              >
                <PhCoins :size="20" aria-hidden="true" />
              </span>
              <span class="min-w-0 pr-5">
                <strong class="block text-sm">{{ asset.symbol }}</strong>
                <span
                  class="mt-0.5 flex items-center gap-0.5 text-sm text-slate"
                >
                  <span class="tabular-nums">
                    {{ formatBalance(asset) }} ·
                    {{
                      asset.marketPriceUsd
                        ? formatUsdValue(assetValueUsd(asset))
                        : "Price unavailable"
                    }}
                  </span>
                  <span
                    class="pointer-events-auto z-20 inline-flex shrink-0"
                    data-price-source
                    @keydown.esc.stop="closePriceSource(asset, true)"
                  >
                    <button
                      :id="priceSourceTriggerId(asset)"
                      type="button"
                      class="focus-ring relative z-40 grid h-7 w-7 place-items-center rounded-md text-slate transition-colors hover:bg-mist hover:text-ink"
                      :class="
                        isPriceSourceOpen(asset)
                          ? 'invisible pointer-events-none'
                          : ''
                      "
                      :aria-label="`Show price source for ${asset.symbol}`"
                      :aria-controls="`price-source-${asset.token}`"
                      :aria-expanded="isPriceSourceOpen(asset)"
                      aria-haspopup="dialog"
                      title="View price source"
                      @click.stop="openPriceSource(asset)"
                    >
                      <PhInfo :size="15" aria-hidden="true" />
                    </button>
                    <div
                      :id="`price-source-${asset.token}`"
                      :aria-label="`Price source for ${asset.symbol}`"
                      role="dialog"
                      aria-modal="false"
                      class="absolute inset-2 z-30 flex items-start gap-2 rounded-lg bg-ink p-2 text-xs leading-4 text-surface shadow-panel transition-opacity duration-150"
                      :class="
                        isPriceSourceOpen(asset)
                          ? 'visible pointer-events-auto opacity-100'
                          : 'invisible pointer-events-none opacity-0'
                      "
                    >
                      <p
                        class="flex min-w-0 flex-1 items-baseline gap-1.5 select-text"
                      >
                        <span class="shrink-0 font-semibold text-surface/70">
                          {{
                            priceSourceAddress(asset) ? "Oracle:" : "Source:"
                          }}
                        </span>
                        <span class="min-w-0 break-all font-mono">
                          {{
                            priceSourceAddress(asset) ??
                            asset.priceProvenance ??
                            "Protocol details explain support"
                          }}
                        </span>
                      </p>
                      <span class="flex shrink-0 gap-1">
                        <button
                          type="button"
                          class="focus-ring grid h-7 w-7 place-items-center rounded-md bg-surface/10 text-surface hover:bg-surface/20"
                          :aria-label="
                            copiedPriceSourceToken === assetKey(asset)
                              ? 'Price source copied'
                              : failedPriceSourceToken === assetKey(asset)
                                ? 'Copy failed; select the source text manually'
                                : priceSourceAddress(asset)
                                  ? `Copy oracle address for ${asset.symbol}`
                                  : `Copy price source for ${asset.symbol}`
                          "
                          :title="
                            failedPriceSourceToken === assetKey(asset)
                              ? 'Copy failed—select the text manually'
                              : priceSourceAddress(asset)
                                ? 'Copy oracle address'
                                : 'Copy price source'
                          "
                          @click.stop="copyPriceSource(asset)"
                        >
                          <PhCheck
                            v-if="copiedPriceSourceToken === assetKey(asset)"
                            :size="15"
                            weight="bold"
                            aria-hidden="true"
                          />
                          <PhCopy v-else :size="15" aria-hidden="true" />
                        </button>
                        <a
                          v-if="priceSourceExplorerUrl(asset)"
                          :href="priceSourceExplorerUrl(asset) ?? undefined"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="focus-ring grid h-7 w-7 place-items-center rounded-md bg-surface/10 text-surface hover:bg-surface/20"
                          :aria-label="`View oracle contract for ${asset.symbol} on Etherscan`"
                          title="View oracle contract"
                          @click.stop
                        >
                          <PhArrowSquareOut :size="15" aria-hidden="true" />
                        </a>
                        <button
                          :id="priceSourceCloseId(asset)"
                          type="button"
                          class="focus-ring grid h-7 w-7 place-items-center rounded-md bg-surface/10 text-surface hover:bg-surface/20"
                          :aria-label="`Close price source for ${asset.symbol}`"
                          title="Close price source"
                          @click.stop="closePriceSource(asset, true)"
                        >
                          <PhX :size="15" aria-hidden="true" />
                        </button>
                      </span>
                    </div>
                  </span>
                </span>
                <span
                  v-if="
                    asset.requiredAction === 'wrap' && asset.symbol !== 'ETH'
                  "
                  class="mt-0.5 block text-xs leading-4 text-slate"
                >
                  Conversion required
                </span>
              </span>
            </span>
          </div>
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
              class="rounded-xl border border-line bg-mist/35 p-4 text-left text-slate disabled:cursor-not-allowed"
              :aria-label="`${asset.symbol} cannot be selected because its price is unavailable`"
              disabled
            >
              <strong class="text-ink">{{ asset.symbol }}</strong>
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

        <details
          v-if="failedMetadataAssets.length"
          class="border-t border-line"
          open
        >
          <summary
            class="focus-ring cursor-pointer px-5 py-4 text-sm font-semibold text-warning sm:px-6"
          >
            Token scale unknown ({{ failedMetadataAssets.length }})
          </summary>
          <ul class="grid gap-3 border-t border-line p-5 sm:grid-cols-2 sm:p-6">
            <li
              v-for="asset in failedMetadataAssets"
              :key="asset.token"
              class="rounded-xl border border-warning-border bg-warning-surface p-4"
            >
              <strong>{{ asset.symbol }}</strong>
              <span class="mt-1 block text-xs leading-5 text-warning">
                {{ asset.balanceReadReason }} Balance and value remain unknown.
              </span>
            </li>
          </ul>
        </details>

        <details
          v-if="failedBalanceAssets.length"
          class="border-t border-line"
          open
        >
          <summary
            class="focus-ring cursor-pointer px-5 py-4 text-sm font-semibold text-warning sm:px-6"
          >
            Balance unknown ({{ failedBalanceAssets.length }})
          </summary>
          <ul class="grid gap-3 border-t border-line p-5 sm:grid-cols-2 sm:p-6">
            <li
              v-for="asset in failedBalanceAssets"
              :key="asset.token"
              class="rounded-xl border border-warning-border bg-warning-surface p-4"
            >
              <strong>{{ asset.symbol }}</strong>
              <span class="mt-1 block text-xs leading-5 text-warning">
                {{ asset.balanceReadReason }} A positive balance cannot be ruled
                out.
              </span>
            </li>
          </ul>
        </details>
      </div>

      <div class="order-3 lg:order-none">
        <slot name="after-main" />
      </div>
    </div>

    <aside
      v-if="assets.length"
      class="panel order-2 p-5 lg:order-none lg:sticky lg:top-24"
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
