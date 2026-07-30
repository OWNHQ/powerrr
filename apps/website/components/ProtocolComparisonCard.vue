<script setup lang="ts">
import { PhArrowSquareOut, PhCaretDown, PhCoins } from "@phosphor-icons/vue";
import type {
  PortfolioAsset,
  ProtocolAvailability,
  ProtocolBorrowQuote,
  ProtocolAssetEvaluation,
} from "@powerrr/shared-types";
import { calculatePooledBorrowPreview } from "../utils/borrow-preview";
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

const capacity = computed(() => props.quote?.safeBorrowUsd ?? 0);
const preview = computed(() =>
  props.quote
    ? calculatePooledBorrowPreview(props.quote, props.amountUsd)
    : null,
);
const assetEvaluations = computed<ProtocolAssetEvaluation[]>(() => {
  if (props.quote?.assetEvaluations) return props.quote.assetEvaluations;
  const sourceUnavailable = props.status?.status === "unavailable";
  return props.assets.map((asset) => ({
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
});
const statusTone = computed(() => {
  if (props.status?.status === "unavailable") return "warning";
  if (capacity.value <= 0) return "muted";
  if (props.amountUsd <= capacity.value) return "available";
  return "warning";
});
const statusLabel = computed(() => {
  if (props.status?.status === "unavailable") return "Data unavailable";
  if (capacity.value <= 0) return "No eligible collateral";
  if (props.amountUsd <= capacity.value) return "Covers request";
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

function constraintLabel(value: string | undefined): string {
  const labels: Record<string, string> = {
    collateral: "Protocol collateral limit",
    "safety-buffer": "Powerrr safety buffer",
    liquidity: "Available market liquidity",
    "minimum-borrow": "Protocol minimum borrow",
    "no-eligible-collateral": "No eligible selected collateral",
  };
  return value ? (labels[value] ?? value) : "—";
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
          <strong class="text-base">{{ label }}</strong>
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
          class="mt-1 shrink-0 text-slate transition"
          :class="expanded ? 'rotate-180' : ''"
          aria-hidden="true"
        />
      </span>

      <span
        class="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-5"
      >
        <span>
          <span class="block text-xs text-slate">Recommended max</span>
          <strong class="mt-0.5 block tabular-nums">{{
            formatUsdValue(capacity)
          }}</strong>
        </span>
        <span>
          <span class="block text-xs text-slate">Rate</span>
          <strong class="mt-0.5 block">{{
            quote ? providerRateLabel(quote) : "—"
          }}</strong>
        </span>
        <span>
          <span class="block text-xs text-slate">Borrow LTV</span>
          <strong class="mt-0.5 block tabular-nums">{{ weightedLtv }}</strong>
        </span>
        <span>
          <span class="block text-xs text-slate">Liquidation threshold</span>
          <strong class="mt-0.5 block tabular-nums">{{
            weightedLiquidation
          }}</strong>
        </span>
        <span>
          <span class="block text-xs text-slate">Health factor</span>
          <strong class="mt-0.5 block tabular-nums">{{
            healthFactorLabel
          }}</strong>
        </span>
      </span>
    </button>

    <div
      v-if="expanded"
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
        <h3 id="limit-title" class="font-semibold">Why this limit</h3>
        <div
          class="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6"
        >
          <div class="rounded-lg bg-mist/55 p-3">
            <span class="block text-xs text-slate">Eligible collateral</span>
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
            <span class="block text-xs text-slate">Safety-adjusted</span>
            <strong class="mt-1 block tabular-nums">{{
              formatUsdValue(breakdown?.safetyAdjustedLimitUsd ?? 0)
            }}</strong>
          </div>
          <div class="rounded-lg bg-mist/55 p-3">
            <span class="block text-xs text-slate">Liquidity</span>
            <strong class="mt-1 block tabular-nums">{{
              formatUsdValue(breakdown?.liquidityLimitUsd ?? 0)
            }}</strong>
          </div>
          <div class="rounded-lg bg-mist/55 p-3">
            <span class="block text-xs text-slate">Recommended max</span>
            <strong class="mt-1 block tabular-nums">{{
              formatUsdValue(breakdown?.recommendedMaxUsd ?? 0)
            }}</strong>
          </div>
          <div class="rounded-lg bg-mist/55 p-3">
            <span class="block text-xs text-slate">Binding constraint</span>
            <strong class="mt-1 block leading-5">{{
              constraintLabel(breakdown?.bindingConstraint)
            }}</strong>
          </div>
        </div>
      </section>

      <section class="mt-6" :aria-labelledby="`${id}-assets-title`">
        <h3 :id="`${id}-assets-title`" class="font-semibold">Your assets</h3>
        <p class="mt-1 text-xs leading-5 text-slate">
          Every positive wallet balance is shown, including assets you did not
          select or cannot use here.
        </p>
        <ul class="mt-3 divide-y divide-line rounded-lg border border-line">
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
                      asset.balanceUsd !== undefined && asset.balanceUsd < 5
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
      </section>

      <div class="mt-5 flex justify-end">
        <a
          :href="preview?.actionable ? link : undefined"
          target="_blank"
          rel="noopener noreferrer"
          class="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-river px-5 text-sm font-semibold text-accent-contrast"
          :class="
            preview?.actionable
              ? 'hover:bg-river/90'
              : 'pointer-events-none opacity-45'
          "
          :aria-disabled="!preview?.actionable"
        >
          Review on {{ label }}
          <PhArrowSquareOut :size="17" aria-hidden="true" />
        </a>
      </div>
    </div>
  </article>
</template>
