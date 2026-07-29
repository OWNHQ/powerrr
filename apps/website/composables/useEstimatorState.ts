import type {
  BorrowOpportunity,
  HexAddress,
  OwnLeadStatusResponse,
  PortfolioAsset,
  PortfolioResponse,
  ProtocolAvailability,
  ProtocolBorrowQuote,
  QuoteRequest,
  QuoteResponse,
} from "@powerrr/shared-types";
import { useMutation } from "@tanstack/vue-query";
import {
  calculatePooledBorrowPreview,
  pooledRiskDescription,
  pooledRiskTitle,
} from "../utils/borrow-preview";
import {
  formatUsdValue,
  friendlyEstimatorError,
  sortAssetsByUsdValue,
  utilizationForAmount,
} from "../utils/estimator-ux";
import {
  groupWebsiteQuoteRows,
  type WebsiteQuoteGroup,
} from "../utils/quote-row";

export type EstimatorStage = "assets" | "terms" | "options";

type EstimatorResult = {
  quote: QuoteResponse;
  portfolio: PortfolioResponse;
};

type EstimatorMutationInput = {
  request: QuoteRequest;
  refresh?: boolean;
};

type PendingAction = "initial" | "filter" | "refresh" | null;

type ProviderItem = {
  id: "aave" | "sparklend" | "compound-iii" | "morpho-blue";
  label: string;
  link: string;
  group?: WebsiteQuoteGroup;
  availability?: ProtocolAvailability;
};

export function useEstimatorState() {
  const api = usePowerrrApi();
  const config = useRuntimeConfig();
  const configuredFixtureMode =
    String(config.public.powerrrDataMode) === "fixtures";
  const input = ref(configuredFixtureMode ? "powerrr.eth" : "");
  const addressError = ref("");
  const stageError = ref("");
  const refreshError = ref("");
  const refreshComplete = ref(false);
  const showSearch = ref(!configuredFixtureMode);
  const showOwnLead = ref(false);
  const ownLeadStatus = ref<OwnLeadStatusResponse | null>(null);
  const landingInput = ref<HTMLInputElement | null>(null);
  const resultSummary = ref<{ focus: (options?: FocusOptions) => void } | null>(
    null,
  );
  const stageHeading = ref<HTMLElement | null>(null);
  const currentStage = ref<EstimatorStage>("assets");
  const pendingAction = ref<PendingAction>(null);
  const selectedCollateralTokens = ref<string[]>([]);
  const selectedProviderId = ref("");
  const borrowAmountUsd = ref(0);
  const discoveryResult = shallowRef<EstimatorResult | null>(null);
  const activeResult = shallowRef<EstimatorResult | null>(null);
  let ownLeadStatusPromise: Promise<OwnLeadStatusResponse> | null = null;
  let refreshConfirmationTimer: ReturnType<typeof setTimeout> | null = null;

  const examples = [
    { label: "Diversified example", value: "powerrr.eth" },
    { label: "Blue-chip example", value: "bluechip.eth" },
    { label: "Stablecoin example", value: "stablecoin.eth" },
    { label: "Empty example", value: "empty.powerrr.eth" },
  ];

  const providerDefinitions: Array<Omit<ProviderItem, "group">> = [
    { id: "aave", label: "Aave", link: "https://app.aave.com/" },
    { id: "sparklend", label: "Spark", link: "https://app.spark.fi/" },
    {
      id: "compound-iii",
      label: "Compound",
      link: "https://app.compound.finance/",
    },
    { id: "morpho-blue", label: "Morpho", link: "https://app.morpho.org/" },
  ];

  const estimatorMutation = useMutation({
    mutationFn: async ({
      request,
      refresh,
    }: EstimatorMutationInput): Promise<EstimatorResult> => {
      const quote = await api.quotes(request, { refresh });
      return { quote, portfolio: quote.portfolio };
    },
  });

  const quoteResponse = computed(() => activeResult.value?.quote ?? null);
  const portfolio = computed(() => activeResult.value?.portfolio ?? null);
  const discoveryPortfolio = computed(
    () => discoveryResult.value?.portfolio ?? null,
  );
  const ownOpportunity = computed<BorrowOpportunity | null>(() => {
    return (
      quoteResponse.value?.opportunities?.find((item) => item.id === "own") ??
      null
    );
  });
  const externalGroups = computed(() =>
    groupWebsiteQuoteRows(quoteResponse.value?.quotes ?? []),
  );
  const providerItems = computed<ProviderItem[]>(() => {
    return providerDefinitions
      .map((definition) => {
        const group = externalGroups.value.find(
          (candidate) => candidate.groupId === definition.id,
        );
        return {
          ...definition,
          ...(group && (group.primaryQuote.safeBorrowUsd ?? 0) > 0
            ? { group }
            : {}),
          availability: quoteResponse.value?.protocolAvailability.find(
            (availability) =>
              availability.protocolId ===
              (definition.id === "aave" ? "aave-v3" : definition.id),
          ),
        };
      })
      .sort((a, b) => providerCapacity(b) - providerCapacity(a));
  });
  const matchingProviderItems = computed(() =>
    providerItems.value.filter(
      (provider) =>
        providerCapacity(provider) > 0 &&
        providerCapacity(provider) >= borrowAmountUsd.value,
    ),
  );
  const bestExternalId = computed(
    () => matchingProviderItems.value[0]?.id ?? null,
  );
  const selectedProvider = computed(
    () =>
      providerItems.value.find(
        (item) => item.id === selectedProviderId.value,
      ) ?? null,
  );
  const selectedQuote = computed<ProtocolBorrowQuote | null>(
    () => selectedProvider.value?.group?.primaryQuote ?? null,
  );
  const usableAssets = computed(() =>
    sortAssetsByUsdValue(
      (discoveryPortfolio.value?.assets ?? []).filter(
        (asset) => assetValueUsd(asset) > 0 && eligibleProviderCount(asset) > 0,
      ),
    ),
  );
  const selectedAssets = computed(() => {
    const selected = new Set(
      selectedCollateralTokens.value.map((token) => token.toLowerCase()),
    );
    return usableAssets.value.filter((asset) =>
      selected.has(asset.token.toLowerCase()),
    );
  });
  const usableCollateralUsd = computed(() => {
    if (selectedCollateralTokens.value.length && quoteResponse.value) {
      return (
        quoteResponse.value.portfolioSummary.matchedCollateralUsd ??
        selectedAssets.value.reduce(
          (sum, asset) => sum + assetValueUsd(asset),
          0,
        )
      );
    }
    return (
      discoveryResult.value?.quote.portfolioSummary.matchedCollateralUsd ??
      usableAssets.value.reduce((sum, asset) => sum + assetValueUsd(asset), 0)
    );
  });
  const isOwnActionable = computed(() => false);
  const isOwnMatching = computed(
    () =>
      isOwnActionable.value &&
      (ownOpportunity.value?.potentialBorrowUsd ?? 0) >= borrowAmountUsd.value,
  );
  const maximumAvailableUsd = computed(() => {
    const capacities = providerItems.value.map(providerCapacity);
    if (isOwnActionable.value) {
      capacities.push(ownOpportunity.value?.potentialBorrowUsd ?? 0);
    }
    return Math.max(0, ...capacities);
  });
  const maxBorrowUsd = computed(() => {
    if (selectedProviderId.value === "own" && isOwnMatching.value) {
      return ownOpportunity.value?.potentialBorrowUsd ?? 0;
    }
    return selectedQuote.value?.safeBorrowUsd ?? 0;
  });
  const pooledPreview = computed(() => {
    return selectedQuote.value
      ? calculatePooledBorrowPreview(selectedQuote.value, borrowAmountUsd.value)
      : null;
  });
  const ownTotalRepayment = computed(() => 0);
  const selectedOwnFundingLabel = computed(() => {
    const opportunity = ownOpportunity.value;
    if (!opportunity || opportunity.potentialBorrowUsd <= 0) return "";
    if (borrowAmountUsd.value <= opportunity.availableNowUsd) {
      return "Ready to review";
    }
    return "Tailored request";
  });
  const selectedOwnFundingClass = computed(
    () => "bg-surface text-own ring-1 ring-own/15",
  );
  const selectedRiskTitle = computed(() => {
    if (selectedProviderId.value === "own") return "Fixed-term repayment plan";
    return pooledRiskTitle(pooledPreview.value?.riskBand ?? "none");
  });
  const selectedRiskDescription = computed(() => {
    if (selectedProviderId.value === "own") {
      return "Repayments follow an onchain schedule. Collateral price changes alone do not trigger liquidation; failure to remain within the schedule can cause default.";
    }
    if (pooledPreview.value?.reasonCodes.includes("below-protocol-minimum")) {
      return `The projected position is below this protocol's ${formatUsdValue(pooledPreview.value.minimumBorrowUsd)} minimum borrow.`;
    }
    return pooledRiskDescription(pooledPreview.value?.riskBand ?? "none");
  });
  const selectedProviderLabel = computed(() =>
    selectedProviderId.value === "own"
      ? "OWN"
      : (selectedProvider.value?.label ?? "Provider"),
  );
  const selectedRate = computed(() =>
    selectedProviderId.value === "own"
      ? (ownOpportunity.value?.indicativeApr ?? 0)
      : (selectedQuote.value?.annualRate?.value ??
        selectedQuote.value?.indicativeApr ??
        0),
  );
  const selectedRateConvention = computed(() =>
    selectedProviderId.value === "own"
      ? "APR"
      : (selectedQuote.value?.annualRate?.convention.toUpperCase() ?? "APR"),
  );
  const selectedAnnualInterest = computed(
    () => borrowAmountUsd.value * selectedRate.value,
  );
  const selectedExternalLink = computed(
    () => selectedProvider.value?.link ?? "#",
  );
  const displayAddress = computed(
    () =>
      quoteResponse.value?.resolvedEnsName ||
      compactAddress(quoteResponse.value?.resolvedAddress),
  );
  const isDemoData = computed(() => quoteResponse.value?.dataMode !== "live");
  const actionableProviderCount = computed(
    () =>
      providerItems.value.filter((provider) => providerCapacity(provider) > 0)
        .length + (isOwnActionable.value ? 1 : 0),
  );
  const hasProviderOutage = computed(() =>
    providerItems.value.some(
      (provider) => provider.availability?.status === "unavailable",
    ),
  );
  const hasActionableSelection = computed(
    () => selectedProviderId.value.length > 0 && maxBorrowUsd.value > 0,
  );
  const utilizationPercent = computed(() =>
    utilizationForAmount(maxBorrowUsd.value, borrowAmountUsd.value),
  );
  const hasStaleEstimate = computed(() => {
    const response = quoteResponse.value;
    if (!response || isDemoData.value) return false;
    return (
      response.observations.some(
        (observation) => observation.freshness === "stale",
      ) ||
      response.quotes.some(
        (quote) =>
          quote.stale ||
          quote.provenance.some(
            (provenance) => provenance.freshnessStatus === "stale",
          ),
      )
    );
  });
  const staleEstimateLabel = computed(() => {
    if (!hasStaleEstimate.value) return "";
    const ages = [
      ...(quoteResponse.value?.observations.map(
        (observation) => observation.ageSeconds,
      ) ?? []),
      ...(quoteResponse.value?.quotes.flatMap((quote) =>
        quote.provenance.map((provenance) => provenance.freshnessSeconds),
      ) ?? []),
    ].filter((age): age is number => age !== undefined);
    return ages.length
      ? `Some rates are ${formatAge(Math.max(...ages))} old`
      : "Some rates need refreshing";
  });
  const amountIsValid = computed(
    () =>
      borrowAmountUsd.value > 0 &&
      borrowAmountUsd.value <= maximumAvailableUsd.value,
  );
  const riskAnnouncement = computed(() =>
    hasActionableSelection.value
      ? `${selectedRiskTitle.value}. The amount reviewed is ${Math.round(utilizationPercent.value)} percent of Powerrr's estimated path limit.`
      : "Select a borrowing path to review its risk.",
  );
  const isInitialLoading = computed(
    () =>
      pendingAction.value === "initial" && estimatorMutation.isPending.value,
  );
  const isFiltering = computed(
    () => pendingAction.value === "filter" && estimatorMutation.isPending.value,
  );
  const isRefreshing = computed(
    () =>
      pendingAction.value === "refresh" && estimatorMutation.isPending.value,
  );

  watch(borrowAmountUsd, () => {
    stageError.value = "";
    if (
      selectedProviderId.value &&
      borrowAmountUsd.value > maxBorrowUsd.value
    ) {
      selectedProviderId.value = "";
    }
  });

  function buildRequest(collateralTokens?: string[]): QuoteRequest {
    const value = input.value.trim();
    const isAddress = /^0x[a-fA-F0-9]{40}$/.test(value);
    return {
      chainId: 1,
      input: isAddress ? { address: value } : { ensName: value.toLowerCase() },
      mode: "wallet-estimate",
      safetyProfile: "balanced",
      targetBorrowAssets: ["USDC"],
      ...(collateralTokens?.length
        ? { collateralTokens: collateralTokens as HexAddress[] }
        : {}),
    };
  }

  async function submit(): Promise<void> {
    if (!input.value.trim()) {
      addressError.value = "Enter an Ethereum address or ENS name.";
      await nextTick();
      landingInput.value?.focus();
      return;
    }
    addressError.value = "";
    refreshError.value = "";
    clearRefreshConfirmation();
    stageError.value = "";
    pendingAction.value = "initial";
    try {
      const response = await estimatorMutation.mutateAsync({
        request: buildRequest(),
      });
      discoveryResult.value = response;
      activeResult.value = response;
      currentStage.value = "assets";
      selectedCollateralTokens.value = [];
      selectedProviderId.value = "";
      borrowAmountUsd.value = 0;
      showSearch.value = false;
      await ensureOwnLeadStatus();
      await focusResult();
    } catch {
      // The mutation error is rendered by the page.
    } finally {
      pendingAction.value = null;
    }
  }

  async function continueFromAssets(): Promise<void> {
    if (!selectedCollateralTokens.value.length) {
      stageError.value = "Select at least one collateral asset to continue.";
      return;
    }
    stageError.value = "";
    pendingAction.value = "filter";
    try {
      activeResult.value = await estimatorMutation.mutateAsync({
        request: buildRequest(selectedCollateralTokens.value),
      });
      selectedProviderId.value = "";
      borrowAmountUsd.value = 0;
      currentStage.value = "terms";
      await focusStage();
    } catch {
      stageError.value = friendlyEstimatorError(estimatorMutation.error.value);
    } finally {
      pendingAction.value = null;
    }
  }

  function continueFromTerms(): void {
    if (!amountIsValid.value) {
      stageError.value =
        borrowAmountUsd.value <= 0
          ? "Enter the amount of USDC you want to borrow."
          : `Enter an amount up to ${formatUsd(maximumAvailableUsd.value)}.`;
      return;
    }
    stageError.value = "";
    selectedProviderId.value = "";
    currentStage.value = "options";
    void focusStage();
  }

  function setAssetSelected(token: string, selected: boolean): void {
    const existing = new Set(selectedCollateralTokens.value);
    if (selected) existing.add(token);
    else existing.delete(token);
    selectedCollateralTokens.value = [...existing];
    stageError.value = "";
  }

  function goToStage(stage: EstimatorStage): void {
    if (stage === "assets") {
      currentStage.value = stage;
    } else if (stage === "terms" && selectedCollateralTokens.value.length) {
      currentStage.value = stage;
    } else if (stage === "options" && amountIsValid.value) {
      currentStage.value = stage;
    } else {
      return;
    }
    stageError.value = "";
    void focusStage();
  }

  async function refreshEstimate(): Promise<void> {
    if (estimatorMutation.isPending.value) return;
    refreshError.value = "";
    clearRefreshConfirmation();
    pendingAction.value = "refresh";
    const requestedStage = currentStage.value;
    const requestedTokens = [...selectedCollateralTokens.value];
    try {
      const refreshesDiscovery =
        requestedStage === "assets" || !requestedTokens.length;
      const refreshed = await estimatorMutation.mutateAsync({
        request: buildRequest(refreshesDiscovery ? undefined : requestedTokens),
        refresh: true,
      });
      if (refreshesDiscovery) discoveryResult.value = refreshed;

      const availableTokens = new Set(
        refreshed.portfolio.assets.map((asset) => asset.token.toLowerCase()),
      );
      selectedCollateralTokens.value = requestedTokens.filter((token) =>
        availableTokens.has(token.toLowerCase()),
      );

      activeResult.value = refreshed;
      if (
        !selectedCollateralTokens.value.length &&
        requestedStage !== "assets"
      ) {
        const discovery = await estimatorMutation.mutateAsync({
          request: buildRequest(),
          refresh: true,
        });
        discoveryResult.value = discovery;
        activeResult.value = discovery;
      }

      if (
        requestedStage === "assets" ||
        !selectedCollateralTokens.value.length
      ) {
        if (
          !selectedCollateralTokens.value.length &&
          requestedStage !== "assets"
        ) {
          currentStage.value = "assets";
          selectedProviderId.value = "";
          borrowAmountUsd.value = 0;
          stageError.value =
            "Your previously selected collateral changed. Choose assets again.";
        }
      } else {
        await nextTick();
        if (borrowAmountUsd.value > maximumAvailableUsd.value) {
          currentStage.value = "terms";
          selectedProviderId.value = "";
          stageError.value =
            "Current capacity changed. Adjust the borrowing amount to continue.";
        } else if (
          selectedProviderId.value === "own"
            ? !isOwnMatching.value
            : !matchingProviderItems.value.some(
                (provider) => provider.id === selectedProviderId.value,
              )
        ) {
          selectedProviderId.value = "";
        }
      }
      showRefreshConfirmation();
    } catch {
      refreshError.value =
        "We couldn’t refresh the estimate. The previous result is still shown.";
    } finally {
      pendingAction.value = null;
    }
  }

  function retryEstimator(): void {
    estimatorMutation.reset();
    discoveryResult.value = null;
    activeResult.value = null;
    addressError.value = "";
    stageError.value = "";
    refreshError.value = "";
    clearRefreshConfirmation();
    showSearch.value = true;
    void nextTick(() => landingInput.value?.focus());
  }

  function openAddressSearch(): void {
    showSearch.value = true;
    void nextTick(() => landingInput.value?.focus());
  }

  function cancelAddressSearch(): void {
    showSearch.value = false;
    addressError.value = "";
  }

  function useExample(value: string): void {
    input.value = value;
    void submit();
  }

  function selectProvider(id: string, capacity: number): void {
    if (borrowAmountUsd.value <= 0 || capacity < borrowAmountUsd.value) return;
    if (id === "own" && !isOwnMatching.value) return;
    selectedProviderId.value = id;
  }

  function providerCapacity(item: ProviderItem): number {
    return item.group?.primaryQuote.safeBorrowUsd ?? 0;
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

  function formatUsd(value: number | null | undefined): string {
    return formatUsdValue(value);
  }

  function formatPercent(value: number | null | undefined, digits = 1): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return "—";
    }
    return new Intl.NumberFormat("en-US", {
      style: "percent",
      maximumFractionDigits: digits,
    }).format(value);
  }

  function formatAge(seconds: number): string {
    if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s`;
    if (seconds < 3_600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3_600)}h`;
  }

  function compactAddress(value: string | undefined): string {
    return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "";
  }

  async function ensureOwnLeadStatus(): Promise<OwnLeadStatusResponse> {
    if (ownLeadStatus.value) return ownLeadStatus.value;
    ownLeadStatusPromise ??= api.ownLeadStatus().catch(() => ({
      enabled: false,
      reason: "OWN request intake could not be confirmed.",
    }));
    ownLeadStatus.value = await ownLeadStatusPromise;
    return ownLeadStatus.value;
  }

  async function focusResult(): Promise<void> {
    await nextTick();
    resultSummary.value?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function focusStage(): Promise<void> {
    await nextTick();
    stageHeading.value?.focus({ preventScroll: true });
    stageHeading.value?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function clearRefreshConfirmation(): void {
    refreshComplete.value = false;
    if (refreshConfirmationTimer) {
      clearTimeout(refreshConfirmationTimer);
      refreshConfirmationTimer = null;
    }
  }

  function showRefreshConfirmation(): void {
    refreshComplete.value = true;
    refreshConfirmationTimer = setTimeout(() => {
      refreshComplete.value = false;
      refreshConfirmationTimer = null;
    }, 4_000);
  }

  onMounted(async () => {
    await ensureOwnLeadStatus();
    if (configuredFixtureMode) await submit();
  });

  onBeforeUnmount(() => {
    if (refreshConfirmationTimer) clearTimeout(refreshConfirmationTimer);
  });

  return {
    configuredFixtureMode,
    input,
    addressError,
    stageError,
    refreshError,
    showSearch,
    showOwnLead,
    ownLeadStatus,
    landingInput,
    resultSummary,
    stageHeading,
    currentStage,
    selectedCollateralTokens,
    selectedProviderId,
    borrowAmountUsd,
    examples,
    estimatorMutation,
    isInitialLoading,
    isFiltering,
    isRefreshing,
    refreshComplete,
    quoteResponse,
    portfolio,
    ownOpportunity,
    providerItems,
    matchingProviderItems,
    bestExternalId,
    maximumAvailableUsd,
    maxBorrowUsd,
    usableAssets,
    selectedAssets,
    usableCollateralUsd,
    pooledPreview,
    ownTotalRepayment,
    selectedOwnFundingLabel,
    selectedOwnFundingClass,
    selectedRiskTitle,
    selectedRiskDescription,
    selectedProviderLabel,
    selectedRate,
    selectedRateConvention,
    selectedAnnualInterest,
    selectedExternalLink,
    displayAddress,
    isDemoData,
    isOwnActionable,
    isOwnMatching,
    actionableProviderCount,
    hasProviderOutage,
    hasActionableSelection,
    utilizationPercent,
    hasStaleEstimate,
    staleEstimateLabel,
    amountIsValid,
    riskAnnouncement,
    submit,
    continueFromAssets,
    continueFromTerms,
    setAssetSelected,
    goToStage,
    refreshEstimate,
    retryEstimator,
    openAddressSearch,
    cancelAddressSearch,
    useExample,
    selectProvider,
    providerCapacity,
    formatUsd,
    formatPercent,
    friendlyEstimatorError,
  };
}
