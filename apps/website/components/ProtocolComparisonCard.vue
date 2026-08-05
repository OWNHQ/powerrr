<script setup lang="ts">
import { PhArrowSquareOut, PhCaretDown, PhCoins } from "@phosphor-icons/vue";
import type {
  PortfolioAsset,
  ProtocolAvailability,
  ProtocolBorrowQuote,
  ProtocolAssetEvaluation,
} from "@powerrr/shared-types";
import {
  calculatePooledBorrowPreview,
  pooledBorrowAvailableUsd,
  pooledRiskTitle,
} from "../utils/borrow-preview";
import { formatUsdValue, providerRateLabel } from "../utils/estimator-ux";

const props = defineProps<{
  id: string;
  label: string;
  link: string;
  quote?: ProtocolBorrowQuote;
  status?: ProtocolAvailability;
  amountUsd: number;
  assets: PortfolioAsset[];
  expanded: boolean;
}>();

const emit = defineEmits<{ toggle: [id: string] }>();

const capacity = computed(() =>
  props.quote ? pooledBorrowAvailableUsd(props.quote) : 0,
);
const preview = computed(() =>
  props.quote
    ? calculatePooledBorrowPreview(props.quote, props.amountUsd)
    : null,
);
const assetEvaluations = computed<ProtocolAssetEvaluation[]>(() => {
  const sourceUnavailable = props.status?.status === "unavailable";
  const evaluations: ProtocolAssetEvaluation[] =
    props.quote?.assetEvaluations ??
    props.assets.map((asset): ProtocolAssetEvaluation => ({
      token: asset.token,
      symbol: asset.symbol,
      balanceUsd: assetUsd(asset),
      selectionStatus: "not-selected",
      eligibilityStatus: sourceUnavailable ? "unknown" : "unsupported",
      reasonCodes: [sourceUnavailable ? "SOURCE_UNAVAILABLE" : "NOT_LISTED"],
      reason: sourceUnavailable
        ? "Support could not be checked because the protocol source was unavailable."
        : "This asset is not supported by the reviewed market.",
    }));

  return [...evaluations]
    .filter((asset) => (asset.contributionUsd ?? 0) > 0)
    .sort(
      (left, right) =>
        (right.contributionUsd ?? 0) - (left.contributionUsd ?? 0),
    );
});
const statusTone = computed(() => {
  if (props.status?.status === "unavailable") return "warning";
  if (capacity.value <= 0) return "muted";
  if (props.amountUsd <= 0) return "muted";
  if (preview.value?.actionable) return "available";
  return "warning";
});
const statusLabel = computed(() => {
  if (props.status?.status === "unavailable") return "Data unavailable";
  if (capacity.value <= 0) return "No eligible collateral";
  if (props.amountUsd <= 0) return "Enter an amount to compare";
  if (preview.value?.reasonCodes.includes("below-protocol-minimum")) {
    return `Below ${formatUsdValue(preview.value.minimumBorrowUsd)} minimum`;
  }
  if (preview.value?.actionable) return "Covers request";
  return `Below request by ${formatUsdValue(props.amountUsd - capacity.value)}`;
});
const weightedLtv = computed(() => weightedFactor("ltv"));
const weightedLiquidation = computed(() =>
  weightedFactor("liquidationThreshold"),
);
const healthFactorLabel = computed(() => {
  const health = preview.value?.healthFactor;
  if (health === null || health === undefined || !Number.isFinite(health))
    return "—";
  return health.toFixed(2);
});
const healthFactorStatusLabel = computed(() =>
  preview.value ? pooledRiskTitle(preview.value.riskBand) : "Not available",
);
const healthFactorToneClass = computed(() => {
  switch (preview.value?.riskBand) {
    case "wide":
      return "text-moss";
    case "reduced":
      return "text-gold";
    case "thin":
    case "at-boundary":
    case "above-threshold":
      return "text-coral";
    default:
      return "text-slate";
  }
});
const breakdown = computed(() => props.quote?.capacityBreakdown);

function weightedFactor(field: "ltv" | "liquidationThreshold"): string {
  const collateral = props.quote?.collateralUsed ?? [];
  const total = collateral.reduce((sum, item) => sum + item.valueUsd, 0);
  if (total <= 0) return "—";
  const weighted = collateral.reduce(
    (sum, item) => sum + item.valueUsd * (item[field] ?? 0),
    0,
  );
  return `${((weighted / total) * 100).toFixed(1)}%`;
}

function assetUsd(asset: PortfolioAsset): number {
  return Number(asset.balance) * Math.max(0, asset.marketPriceUsd ?? 0);
}

function formatPercent(value: number | undefined): string {
  return value === undefined ? "—" : `${(value * 100).toFixed(1)}%`;
}

function evaluationLabel(item: ProtocolAssetEvaluation): string {
  if (item.reasonCodes.includes("CONVERSION_REQUIRED")) return "Wrap required";
  if (item.eligibilityStatus === "included") return "Included";
  if (item.eligibilityStatus === "supported") return "Supported · not selected";
  if (item.eligibilityStatus === "temporarily-unavailable")
    return "Temporarily unavailable";
  if (item.eligibilityStatus === "unknown") return "Support not checked";
  if (item.reasonCodes.includes("PRICE_UNAVAILABLE"))
    return "Price unavailable";
  return "Not supported";
}
</script>

<template>
  <article
    class="overflow-hidden rounded-xl border border-line bg-surface"
    :data-protocol-id="id"
  >
    <button
      type="button"
      class="focus-ring w-full px-4 py-4 text-left sm:px-5"
      :aria-expanded="expanded"
      :aria-controls="`${id}-details`"
      @click="emit('toggle', id)"
    >
      <span class="flex items-start justify-between gap-4">
        <span>
          <strong class="type-subtitle">{{ label }}</strong>
          <span
            class="mt-1 block text-xs font-semibold"
            :class="{
              'text-moss': statusTone === 'available',
              'text-warning': statusTone === 'warning',
              'text-slate': statusTone === 'muted',
            }"
          >
            {{ statusLabel }}
          </span>
        </span>
        <PhCaretDown
          :size="18"
          class="mt-1 shrink-0 text-slate transition-transform duration-200"
          :class="expanded ? 'rotate-180' : ''"
          aria-hidden="true"
        />
      </span>

      <span
        class="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4"
      >
        <span>
          <span class="type-metric-label block text-slate">Rate</span>
          <strong class="type-data mt-0.5 block">{{
            quote ? providerRateLabel(quote) : "—"
          }}</strong>
        </span>
        <span>
          <span class="type-metric-label block text-slate">Borrow LTV</span>
          <strong class="type-data mt-0.5 block">{{ weightedLtv }}</strong>
        </span>
        <span>
          <span class="type-metric-label block text-slate"
            >Liquidation threshold</span
          >
          <strong class="type-data mt-0.5 block">{{
            weightedLiquidation
          }}</strong>
        </span>
        <span>
          <span class="type-metric-label block text-slate">Health factor</span>
          <span
            class="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5"
            :class="healthFactorToneClass"
            data-health-factor
            :data-risk-band="preview?.riskBand ?? 'none'"
          >
            <span
              class="h-2 w-2 shrink-0 rounded-full bg-current"
              aria-hidden="true"
            ></span>
            <strong class="type-data">{{ healthFactorLabel }}</strong>
            <span class="text-xs font-semibold">{{
              healthFactorStatusLabel
            }}</span>
          </span>
        </span>
      </span>
    </button>

    <div
      class="flex min-h-14 items-center justify-end border-t border-line bg-mist/30 px-4 py-2 sm:px-5"
      data-provider-action
    >
      <a
        :href="preview?.actionable ? link : undefined"
        target="_blank"
        rel="noopener noreferrer"
        class="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-semibold text-river"
        :class="
          preview?.actionable
            ? 'hover:border-river'
            : 'pointer-events-none opacity-45'
        "
        :aria-disabled="!preview?.actionable"
      >
        Review on {{ label }}
        <PhArrowSquareOut :size="17" aria-hidden="true" />
      </a>
    </div>

    <Transition name="provider-disclosure">
      <div v-if="expanded" class="provider-disclosure" data-provider-disclosure>
        <div class="min-h-0 overflow-hidden">
          <div
            :id="`${id}-details`"
            class="border-t border-line px-4 py-5 sm:px-5"
          >
            <div
              v-if="status?.status === 'unavailable'"
              class="rounded-lg border border-warning-border bg-warning-surface p-3 text-sm text-warning"
            >
              {{
                status.reason ??
                "Protocol state could not be read at the pinned block."
              }}
            </div>

            <section aria-labelledby="limit-title">
              <h3 id="limit-title" class="font-semibold">
                How this path is calculated
              </h3>
              <div class="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div class="rounded-lg bg-mist/55 p-3">
                  <span class="block text-xs text-slate"
                    >Eligible collateral</span
                  >
                  <strong class="mt-1 block tabular-nums">{{
                    formatUsdValue(breakdown?.collateralValueUsd ?? 0)
                  }}</strong>
                </div>
                <div class="rounded-lg bg-mist/55 p-3">
                  <span class="block text-xs text-slate">Protocol limit</span>
                  <strong class="mt-1 block tabular-nums">{{
                    formatUsdValue(breakdown?.protocolBorrowLimitUsd ?? 0)
                  }}</strong>
                </div>
                <div class="rounded-lg bg-mist/55 p-3">
                  <span class="block text-xs text-slate">Liquidity</span>
                  <strong class="mt-1 block tabular-nums">{{
                    formatUsdValue(breakdown?.liquidityLimitUsd ?? 0)
                  }}</strong>
                </div>
              </div>
            </section>

            <section class="mt-6" :aria-labelledby="`${id}-assets-title`">
              <h3 :id="`${id}-assets-title`" class="font-semibold">
                Contributing assets
              </h3>
              <p class="mt-1 text-xs leading-5 text-slate">
                Only assets included in this provider’s modeled collateral are
                shown, ordered by USD contribution.
              </p>
              <ul
                v-if="assetEvaluations.length"
                class="mt-3 divide-y divide-line rounded-lg border border-line"
              >
                <li
                  v-for="asset in assetEvaluations"
                  :key="asset.token"
                  class="grid gap-3 px-3 py-3 text-sm sm:grid-cols-[minmax(9rem,1fr)_minmax(10rem,1.2fr)_repeat(3,minmax(5rem,0.7fr))] sm:items-center"
                >
                  <span class="flex min-w-0 items-center gap-2">
                    <span
                      class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-mist text-river"
                    >
                      <PhCoins :size="17" aria-hidden="true" />
                    </span>
                    <span class="min-w-0">
                      <strong class="block truncate">{{ asset.symbol }}</strong>
                      <span class="block text-xs tabular-nums text-slate">
                        {{
                          asset.balanceUsd === undefined
                            ? "Unpriced"
                            : formatUsdValue(asset.balanceUsd)
                        }}
                        <template
                          v-if="
                            asset.balanceUsd !== undefined &&
                            asset.balanceUsd < 5
                          "
                        >
                          · small balance</template
                        >
                      </span>
                    </span>
                  </span>
                  <span>
                    <strong class="block text-xs">{{
                      evaluationLabel(asset)
                    }}</strong>
                    <span class="mt-0.5 block text-xs leading-5 text-slate">{{
                      asset.reason
                    }}</span>
                  </span>
                  <span
                    ><span class="block text-xs text-slate">LTV</span
                    ><strong class="tabular-nums">{{
                      formatPercent(asset.ltv)
                    }}</strong></span
                  >
                  <span
                    ><span class="block text-xs text-slate">Liquidation</span
                    ><strong class="tabular-nums">{{
                      formatPercent(asset.liquidationThreshold)
                    }}</strong></span
                  >
                  <span
                    ><span class="block text-xs text-slate">Contribution</span
                    ><strong class="tabular-nums">{{
                      asset.contributionUsd === undefined
                        ? "—"
                        : formatUsdValue(asset.contributionUsd)
                    }}</strong></span
                  >
                </li>
              </ul>
              <p
                v-else
                class="mt-3 rounded-lg border border-line bg-mist/45 px-3 py-4 text-sm text-slate"
              >
                No selected asset contributes to this path.
              </p>
            </section>
          </div>
        </div>
      </div>
    </Transition>
  </article>
</template>
