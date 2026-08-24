<script setup lang="ts">
import { PhArrowSquareOut, PhCaretDown, PhCoins } from "@phosphor-icons/vue";
import type {
  PortfolioAsset,
  ProtocolAvailability,
  ProtocolBorrowQuote,
  ProtocolAssetEvaluation,
  RawAmount,
} from "@powerrr/shared-types";
import { rawAmountToNumber } from "@powerrr/math";
import {
  calculatePooledBorrowPreview,
  morphoRouteAssetEvaluations,
  pooledBorrowAvailableUsd,
  pooledRiskTitleForPreview,
} from "../utils/borrow-preview";
import {
  formatAnnualRatePercent,
  formatUsdValue,
  minimumConstrainedMarketStatusLabel,
  providerBorrowApr,
  weightedRouteBorrowApr,
} from "../utils/estimator-ux";
import { morphoMarketDestination } from "../utils/provider-destination";

const props = defineProps<{
  id: string;
  label: string;
  link?: string;
  destinationLabel?: string;
  quote?: ProtocolBorrowQuote;
  status?: ProtocolAvailability;
  amount: RawAmount;
  assets: PortfolioAsset[];
  expanded: boolean;
}>();

const emit = defineEmits<{ toggle: [id: string] }>();

const capacity = computed(() =>
  props.quote ? pooledBorrowAvailableUsd(props.quote) : 0,
);
const preview = computed(() =>
  props.quote ? calculatePooledBorrowPreview(props.quote, props.amount) : null,
);
const amountUsd = computed(() => rawAmountToNumber(props.amount));
const minimumBorrowUsd = computed(() =>
  Math.max(0, props.quote?.minimumBorrowUsd ?? 0),
);
const minimumBorrowBlocksMarket = computed(
  () => props.quote?.capacityBreakdown?.bindingConstraint === "minimum-borrow",
);
const protocolBorrowLimitUsd = computed(() =>
  Math.max(0, props.quote?.capacityBreakdown?.protocolBorrowLimitUsd ?? 0),
);
const assetEvaluations = computed<ProtocolAssetEvaluation[]>(() => {
  const sourceUnavailable = props.status?.status === "unavailable";
  const evaluations: ProtocolAssetEvaluation[] =
    props.quote?.isolatedMarketCapacities && preview.value?.isolatedRoute
      ? morphoRouteAssetEvaluations(props.quote, preview.value.isolatedRoute)
      : (props.quote?.assetEvaluations ??
        props.assets.map((asset): ProtocolAssetEvaluation => ({
          token: asset.token,
          symbol: asset.symbol,
          balanceUsd: assetUsd(asset),
          selectionStatus: "not-selected",
          eligibilityStatus: sourceUnavailable ? "unknown" : "unsupported",
          reasonCodes: [
            sourceUnavailable ? "SOURCE_UNAVAILABLE" : "NOT_LISTED",
          ],
          reason: sourceUnavailable
            ? "Support could not be checked because the protocol source was unavailable."
            : "This asset is not supported by the reviewed market.",
        })));

  return [...evaluations]
    .filter((asset) => (asset.contributionUsd ?? 0) > 0)
    .sort(
      (left, right) =>
        (right.contributionUsd ?? 0) - (left.contributionUsd ?? 0),
    );
});
const statusTone = computed(() => {
  if (props.status?.status === "unavailable") return "warning";
  if (minimumBorrowBlocksMarket.value) return "warning";
  if (capacity.value <= 0) return "muted";
  if (amountUsd.value <= 0) return "muted";
  return "warning";
});
const statusLabel = computed(() => {
  if (props.status?.status === "unavailable") return "Data unavailable";
  if (minimumBorrowBlocksMarket.value) {
    return minimumConstrainedMarketStatusLabel(
      amountUsd.value,
      minimumBorrowUsd.value,
      protocolBorrowLimitUsd.value,
    );
  }
  if (preview.value?.reasonCodes.includes("below-protocol-minimum")) {
    return `Borrow at least ${formatUsdValue(preview.value.minimumBorrowUsd)}`;
  }
  if (capacity.value <= 0) return "No supported collateral";
  if (amountUsd.value <= 0) return "Enter an amount";
  return null;
});
const displayedLtv = computed(() =>
  preview.value && preview.value.collateralValueUsd > 0
    ? formatPercent(preview.value.projectedLtv)
    : "—",
);
const displayedLiquidationThreshold = computed(() =>
  preview.value && preview.value.collateralValueUsd > 0
    ? formatPercent(preview.value.liquidationThresholdLtv)
    : "—",
);
const healthFactorStatusLabel = computed(() =>
  preview.value ? pooledRiskTitleForPreview(preview.value) : "Not available",
);
const breakdown = computed(() => props.quote?.capacityBreakdown);
const isolatedRoute = computed(() => preview.value?.isolatedRoute);
const isMorpho = computed(() => Boolean(props.quote?.isolatedMarketCapacities));
const rateLabel = computed(() => {
  const routeApr = isolatedRoute.value?.legs.length
    ? weightedRouteBorrowApr(isolatedRoute.value.legs)
    : null;
  const apr = routeApr ?? (props.quote ? providerBorrowApr(props.quote) : null);
  return formatAnnualRatePercent(apr);
});
const singleMarketDestination = computed(() => {
  const leg = isolatedRoute.value?.legs[0];
  if (isolatedRoute.value?.legs.length !== 1 || !leg) return undefined;
  return morphoMarketDestination(
    leg.marketId,
    leg.collateralSymbol,
    props.quote?.targetBorrowAsset,
  );
});
const actionDestination = computed(() =>
  isMorpho.value
    ? singleMarketDestination.value
    : props.link
      ? { href: props.link, label: props.destinationLabel ?? props.label }
      : undefined,
);
const hasMultipleRouteLegs = computed(
  () => (isolatedRoute.value?.legs.length ?? 0) > 1,
);
const canOpenDestination = computed(() =>
  Boolean(preview.value?.actionable && actionDestination.value),
);

function assetUsd(asset: PortfolioAsset): number {
  return Number(asset.balance) * Math.max(0, asset.marketPriceUsd ?? 0);
}

function formatPercent(value: number | undefined): string {
  return value === undefined ? "—" : `${(value * 100).toFixed(1)}%`;
}

function formatRawPercent(value: { numerator: string; denominator: string }) {
  return formatPercent(Number(value.numerator) / Number(value.denominator));
}

function formatRawAnnualRate(value: {
  numerator: string;
  denominator: string;
}) {
  return formatAnnualRatePercent(
    Number(value.numerator) / Number(value.denominator),
  );
}

function formatTokenAmount(value: { raw: string; decimals: number }): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6,
  }).format(rawAmountToNumber(value));
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
    :data-expanded="expanded"
  >
    <button
      type="button"
      class="focus-ring group relative grid min-h-20 w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-mist/25 sm:px-5 lg:grid-cols-[minmax(10rem,1.25fr)_minmax(8rem,0.8fr)_minmax(8rem,0.8fr)_minmax(16rem,1.5fr)_2.75rem] lg:items-center lg:gap-4"
      :class="expanded ? 'bg-mist/30' : 'bg-surface'"
      :aria-expanded="expanded"
      :aria-controls="`${id}-details`"
      @click="emit('toggle', id)"
    >
      <span class="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <strong class="type-subtitle">{{ label }}</strong>
        <span
          v-if="statusLabel"
          class="inline-flex min-h-6 items-center rounded-full border px-2 py-0.5 text-xs font-semibold"
          :class="{
            'border-warning-border bg-warning-surface text-warning':
              statusTone === 'warning',
            'border-line bg-mist/60 text-slate': statusTone === 'muted',
          }"
        >
          {{ statusLabel }}
        </span>
      </span>

      <span class="min-w-0">
        <span class="type-metric-label block text-slate lg:sr-only">APR</span>
        <strong class="type-data mt-1 block text-sm lg:mt-0">{{
          rateLabel
        }}</strong>
      </span>

      <span class="min-w-0">
        <span class="type-metric-label block text-slate lg:sr-only"
          >Max borrow</span
        >
        <strong class="type-data mt-1 block text-sm lg:mt-0">{{
          formatUsdValue(capacity)
        }}</strong>
      </span>

      <LiquidationBufferMeter
        :id="`${id}-liquidation-buffer`"
        hide-label-at-wide
        :health-factor="preview?.healthFactor ?? null"
        :risk-band="preview?.riskBand ?? 'none'"
        :status-label="healthFactorStatusLabel"
      />

      <span
        class="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-lg text-slate transition-colors group-hover:text-ink lg:static"
        aria-hidden="true"
      >
        <PhCaretDown
          :size="19"
          class="transition-transform duration-200"
          :class="expanded ? 'rotate-180' : ''"
        />
      </span>
    </button>

    <Transition name="provider-disclosure">
      <div
        v-if="expanded"
        :id="`${id}-details`"
        class="provider-disclosure"
        data-market-details
      >
        <div class="min-h-0 border-t border-line">
          <div class="px-4 py-5 sm:px-5">
            <div
              v-if="status?.status === 'unavailable'"
              class="mb-5 rounded-lg border border-warning-border bg-warning-surface p-3 text-sm text-warning"
            >
              {{
                status.reason ??
                "Protocol state could not be read at the pinned block."
              }}
            </div>

            <section :aria-labelledby="`${id}-limit-title`">
              <div
                class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
              >
                <div>
                  <h3 :id="`${id}-limit-title`" class="font-semibold">
                    Technical details
                  </h3>
                </div>
                <a
                  v-if="!hasMultipleRouteLegs"
                  :href="
                    canOpenDestination ? actionDestination?.href : undefined
                  "
                  target="_blank"
                  rel="noopener noreferrer"
                  class="focus-ring inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-semibold text-river"
                  :class="
                    canOpenDestination
                      ? 'hover:border-river'
                      : 'pointer-events-none opacity-45'
                  "
                  :aria-disabled="!canOpenDestination"
                  data-provider-action
                >
                  Review this option on
                  {{ actionDestination?.label ?? destinationLabel ?? label }}
                  <PhArrowSquareOut :size="17" aria-hidden="true" />
                </a>
              </div>

              <dl
                class="mt-4 grid grid-cols-2 divide-x divide-y divide-line/70 overflow-hidden rounded-lg border border-line text-sm sm:grid-cols-3 sm:divide-y-0"
                :class="
                  minimumBorrowUsd > 0 ? 'lg:grid-cols-6' : 'lg:grid-cols-5'
                "
              >
                <div class="bg-mist/45 p-3">
                  <dt class="text-xs text-slate">Collateral used</dt>
                  <dd class="type-data mt-1">
                    {{ formatUsdValue(breakdown?.collateralValueUsd ?? 0) }}
                  </dd>
                </div>
                <div class="bg-mist/45 p-3">
                  <dt class="text-xs text-slate">Protocol borrow limit</dt>
                  <dd class="type-data mt-1">
                    {{ formatUsdValue(breakdown?.protocolBorrowLimitUsd ?? 0) }}
                  </dd>
                </div>
                <div class="bg-mist/45 p-3">
                  <dt class="text-xs text-slate">Liquidity</dt>
                  <dd class="type-data mt-1">
                    {{ formatUsdValue(breakdown?.liquidityLimitUsd ?? 0) }}
                  </dd>
                </div>
                <div class="bg-mist/45 p-3">
                  <dt class="text-xs text-slate">Projected LTV</dt>
                  <dd class="type-data mt-1">{{ displayedLtv }}</dd>
                </div>
                <div
                  class="bg-mist/45 p-3"
                  :class="
                    minimumBorrowUsd > 0 ? '' : 'col-span-2 sm:col-span-1'
                  "
                >
                  <dt class="text-xs text-slate">Liquidation threshold</dt>
                  <dd class="type-data mt-1">
                    {{ displayedLiquidationThreshold }}
                  </dd>
                </div>
                <div v-if="minimumBorrowUsd > 0" class="bg-mist/45 p-3">
                  <dt class="text-xs text-slate">Minimum borrow</dt>
                  <dd class="type-data mt-1">
                    {{ formatUsdValue(minimumBorrowUsd) }}
                  </dd>
                </div>
              </dl>
            </section>

            <section
              v-if="isolatedRoute?.legs.length"
              class="mt-6"
              :aria-labelledby="`${id}-routes-title`"
            >
              <h3 :id="`${id}-routes-title`" class="font-semibold">
                Market route
              </h3>
              <p class="mt-1 text-xs leading-5 text-slate">
                Independent Morpho positions for the requested amount. The
                displayed rate is weighted by USDC borrowed in each leg, and
                collateral is assigned to keep the same health factor across
                active legs.
              </p>
              <ul
                class="mt-3 divide-y divide-line rounded-lg border border-line"
              >
                <li
                  v-for="leg in isolatedRoute.legs"
                  :key="leg.marketId"
                  class="grid gap-3 px-3 py-3 text-sm sm:grid-cols-[minmax(8rem,1fr)_repeat(4,minmax(5rem,0.75fr))_auto] sm:items-center"
                >
                  <span>
                    <strong class="block">{{ leg.collateralSymbol }}</strong>
                    <span class="block text-xs tabular-nums text-slate">
                      {{ formatTokenAmount(leg.collateralAssigned) }} assigned ·
                      {{
                        formatUsdValue(rawAmountToNumber(leg.collateralValue))
                      }}
                    </span>
                  </span>
                  <span>
                    <span class="block text-xs text-slate">USDC</span>
                    <strong class="tabular-nums">{{
                      formatUsdValue(rawAmountToNumber(leg.borrowAmount))
                    }}</strong>
                  </span>
                  <span>
                    <span class="block text-xs text-slate">Current APY</span>
                    <strong class="tabular-nums">{{
                      formatRawAnnualRate(leg.currentBorrowApy)
                    }}</strong>
                  </span>
                  <span>
                    <span class="block text-xs text-slate">LLTV</span>
                    <strong class="tabular-nums">{{
                      formatRawPercent(leg.lltv)
                    }}</strong>
                  </span>
                  <span>
                    <span class="block text-xs text-slate">Liquidity</span>
                    <strong class="tabular-nums">{{
                      formatUsdValue(rawAmountToNumber(leg.availableLiquidity))
                    }}</strong>
                  </span>
                  <a
                    :href="
                      morphoMarketDestination(
                        leg.marketId,
                        leg.collateralSymbol,
                        quote?.targetBorrowAsset,
                      )?.href
                    "
                    target="_blank"
                    rel="noopener noreferrer"
                    class="focus-ring inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-line px-3 font-semibold text-river hover:border-river"
                  >
                    Market
                    <PhArrowSquareOut :size="16" aria-hidden="true" />
                  </a>
                </li>
              </ul>
            </section>

            <section class="mt-6" :aria-labelledby="`${id}-assets-title`">
              <h3 :id="`${id}-assets-title`" class="font-semibold">
                Contributing assets
              </h3>
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
                    ><span class="block text-xs text-slate">Borrow limit</span
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
