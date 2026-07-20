import type {
  BorrowOpportunity,
  OwnLeadStatusResponse,
  PortfolioAsset,
  PortfolioResponse,
  ProtocolAvailability,
  ProtocolBorrowQuote,
  QuoteRequest,
  QuoteResponse,
} from "@powerrr/shared-types";
import { useMutation } from "@tanstack/vue-query";
import { calculatePooledBorrowPreview } from "../utils/borrow-preview";
import {
  amountForUtilization,
  chooseDefaultProviderId,
  formatUsdValue,
  friendlyEstimatorError,
  sortAssetsByUsdValue,
  utilizationForAmount,
} from "../utils/estimator-ux";
import {
  groupWebsiteQuoteRows,
  type WebsiteQuoteGroup,
} from "../utils/quote-row";

type EstimatorResult = {
  quote: QuoteResponse;
  portfolio: PortfolioResponse;
};

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
  const selectedProviderId = ref<string>("");
  const borrowAmountUsd = ref(0);
  const walletError = ref("");
  const showSearch = ref(!configuredFixtureMode);
  const showOwnLead = ref(false);
  const assetsExpanded = ref(false);
  const ownLeadStatus = ref<OwnLeadStatusResponse | null>(null);
  const loadingOwnLeadStatus = ref(true);
  const landingInput = ref<HTMLInputElement | null>(null);
  const resultSummary = ref<{
    focus: (options?: FocusOptions) => void;
  } | null>(null);
  let ownLeadStatusPromise: Promise<OwnLeadStatusResponse> | null = null;

  const examples = [
    { label: "Diversified wallet", value: "powerrr.eth" },
    { label: "Blue-chip wallet", value: "bluechip.eth" },
    { label: "Stablecoin wallet", value: "stablecoin.eth" },
    { label: "Empty wallet", value: "empty.powerrr.eth" },
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
    mutationFn: async (request: QuoteRequest): Promise<EstimatorResult> => {
      const quote = await api.quotes(request);
      return { quote, portfolio: quote.portfolio };
    },
    onSuccess: async ({ quote }) => {
      const status = await ensureOwnLeadStatus();
      const opportunity = quote.opportunities?.find(
        (item) => item.id === "own",
      );
      const externalProviders = groupWebsiteQuoteRows(quote.quotes).map(
        (group) => ({
          id: group.groupId,
          capacityUsd: group.primaryQuote.safeBorrowUsd ?? 0,
        }),
      );
      selectedProviderId.value = chooseDefaultProviderId({
        ownPotentialUsd: opportunity?.potentialBorrowUsd ?? 0,
        ownLeadEnabled: status.enabled,
        providers: externalProviders,
      });
      const selectedCapacity =
        selectedProviderId.value === "own"
          ? (opportunity?.potentialBorrowUsd ?? 0)
          : (externalProviders.find(
              (provider) => provider.id === selectedProviderId.value,
            )?.capacityUsd ?? 0);
      borrowAmountUsd.value = amountForUtilization(selectedCapacity, 50);
      walletError.value = "";
      showSearch.value = false;
      assetsExpanded.value = false;
      await nextTick();
      resultSummary.value?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });

  const result = computed<EstimatorResult | null>(
    () => estimatorMutation.data.value ?? null,
  );
  const quoteResponse = computed(() => result.value?.quote ?? null);
  const portfolio = computed(() => result.value?.portfolio ?? null);
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
          (group) => group.groupId === definition.id,
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
  const bestExternalId = computed(
    () => providerItems.value.find((item) => item.group)?.id ?? null,
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
  const maxBorrowUsd = computed(() => {
    if (selectedProviderId.value === "own") {
      return ownOpportunity.value?.potentialBorrowUsd ?? 0;
    }
    return selectedQuote.value?.safeBorrowUsd ?? 0;
  });
  const usableAssets = computed(() =>
    sortAssetsByUsdValue(
      (portfolio.value?.assets ?? []).filter((asset) => {
        return assetValueUsd(asset) > 0 && eligibleProviderCount(asset) > 0;
      }),
    ),
  );
  const usableCollateralUsd = computed(
    () =>
      quoteResponse.value?.portfolioSummary.matchedCollateralUsd ??
      usableAssets.value.reduce((sum, asset) => sum + assetValueUsd(asset), 0),
  );
  const conversionRequiredAssets = computed(() =>
    usableAssets.value.filter((asset) => asset.requiredAction === "wrap"),
  );
  const pooledPreview = computed(() => {
    return selectedQuote.value
      ? calculatePooledBorrowPreview(selectedQuote.value, borrowAmountUsd.value)
      : null;
  });
  const ownCollateralUsd = computed(() => {
    return (
      ownOpportunity.value?.collateralUsed.reduce(
        (sum, item) => sum + item.valueUsd,
        0,
      ) ?? 0
    );
  });
  const ownLtv = computed(() =>
    ownCollateralUsd.value > 0
      ? borrowAmountUsd.value / ownCollateralUsd.value
      : 0,
  );
  const ownTotalRepayment = computed(() => {
    const opportunity = ownOpportunity.value;
    if (!opportunity) return 0;
    return (
      borrowAmountUsd.value *
      (1 + (opportunity.indicativeApr * opportunity.termMonths) / 12)
    );
  });
  const selectedOwnFundingLabel = computed(() => {
    const opportunity = ownOpportunity.value;
    if (!opportunity || opportunity.potentialBorrowUsd <= 0) {
      return "Unavailable";
    }
    if (
      borrowAmountUsd.value > 0 &&
      borrowAmountUsd.value <= opportunity.availableNowUsd
    ) {
      return "Available now";
    }
    return "Request required";
  });
  const selectedOwnFundingClass = computed(() => {
    return selectedOwnFundingLabel.value === "Available now"
      ? "bg-emerald-100 text-emerald-800"
      : selectedOwnFundingLabel.value === "Unavailable"
        ? "bg-slate-200 text-slate-700"
        : "bg-amber-100 text-amber-900";
  });
  const selectedRiskTitle = computed(() => {
    if (selectedProviderId.value === "own") {
      return "Fixed-term maturity risk";
    }
    if (pooledPreview.value?.status === "comfortable") {
      return "Comfortable buffer";
    }
    if (pooledPreview.value?.status === "watch") return "Watch your buffer";
    return "Close to liquidation";
  });
  const selectedRiskDescription = computed(() => {
    if (selectedProviderId.value === "own") {
      return "No automatic price-triggered liquidation; repayment is due by maturity.";
    }
    if (pooledPreview.value?.status === "comfortable") {
      return "The selected amount remains well above the protocol threshold.";
    }
    if (pooledPreview.value?.status === "watch") {
      return "A market decline could move this position toward liquidation.";
    }
    return "This amount leaves little room before the liquidation threshold.";
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
  const isOwnActionable = computed(() =>
    Boolean(
      ownOpportunity.value &&
      ownOpportunity.value.potentialBorrowUsd > 0 &&
      ownLeadStatus.value?.enabled,
    ),
  );
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
  const hasActionableSelection = computed(() => maxBorrowUsd.value > 0);
  const utilizationPercent = computed({
    get: () => utilizationForAmount(maxBorrowUsd.value, borrowAmountUsd.value),
    set: (percent: number) => {
      borrowAmountUsd.value = amountForUtilization(maxBorrowUsd.value, percent);
    },
  });
  const ownUnavailableReason = computed(() => {
    if (!ownOpportunity.value || ownOpportunity.value.potentialBorrowUsd <= 0) {
      return "Not eligible for this wallet";
    }
    if (loadingOwnLeadStatus.value) return "Checking request availability";
    return ownLeadStatus.value?.reason || "Requests are temporarily closed";
  });
  const estimateFreshnessLabel = computed(() => {
    if (isDemoData.value) return "Demo data";
    const response = quoteResponse.value;
    if (!response) return "Live Ethereum estimate";
    const measuredAges = response.observations
      .map((observation) => observation.ageSeconds)
      .filter((age): age is number => age !== undefined);
    const sourceAge = measuredAges.length ? Math.max(...measuredAges) : null;
    const cacheLabel =
      response.cache.status === "hit"
        ? `cached ${formatAge(response.cache.ageSeconds)}`
        : "live read";
    const sourceLabel =
      sourceAge === null
        ? "freshness unknown"
        : `oldest source ${formatAge(sourceAge)}`;
    return `${cacheLabel} · block ${response.blockNumber} · ${sourceLabel}`;
  });
  const riskAnnouncement = computed(() =>
    hasActionableSelection.value
      ? `${selectedRiskTitle.value}. ${Math.round(utilizationPercent.value)} percent of estimated borrowing power selected.`
      : "Select an available provider to review an amount and risk.",
  );

  watch(maxBorrowUsd, (maximum) => {
    if (borrowAmountUsd.value > maximum) {
      borrowAmountUsd.value = amountForUtilization(maximum, 50);
    }
  });

  function buildRequest(): QuoteRequest {
    const value = input.value.trim();
    const isAddress = /^0x[a-fA-F0-9]{40}$/.test(value);
    return {
      chainId: 1,
      input: isAddress ? { address: value } : { ensName: value.toLowerCase() },
      mode: "wallet-estimate",
      safetyProfile: "balanced",
      targetBorrowAssets: ["USDC"],
    };
  }

  function submit(): void {
    if (!input.value.trim()) {
      walletError.value = "Enter an Ethereum address or ENS name.";
      nextTick(() => landingInput.value?.focus());
      return;
    }
    walletError.value = "";
    estimatorMutation.mutate(buildRequest());
  }

  function retryEstimator(): void {
    estimatorMutation.reset();
    walletError.value = "";
    showSearch.value = true;
    nextTick(() => {
      landingInput.value?.focus();
      landingInput.value?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }

  function openWalletSearch(): void {
    showSearch.value = true;
    nextTick(() => {
      landingInput.value?.focus();
      landingInput.value?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }

  function toggleWalletSearch(): void {
    if (showSearch.value) {
      showSearch.value = false;
      return;
    }
    openWalletSearch();
  }

  async function connectWallet(): Promise<void> {
    walletError.value = "";
    if (!window.ethereum) {
      walletError.value =
        "No browser wallet provider found. You can paste an address or ENS instead.";
      showSearch.value = true;
      return;
    }
    try {
      const accounts = await window.ethereum.request<string[]>({
        method: "eth_requestAccounts",
      });
      if (accounts[0]) {
        input.value = accounts[0];
        submit();
      }
    } catch {
      walletError.value = "Wallet connection was not completed.";
    }
  }

  function useExample(value: string): void {
    input.value = value;
    submit();
  }

  function selectProvider(id: string, capacity: number): void {
    if (capacity <= 0) return;
    if (id === "own" && !isOwnActionable.value) return;
    const previousUtilization = hasActionableSelection.value
      ? utilizationPercent.value
      : 50;
    selectedProviderId.value = id;
    borrowAmountUsd.value = amountForUtilization(capacity, previousUtilization);
  }

  function providerCapacity(item: ProviderItem): number {
    return item.group?.primaryQuote.safeBorrowUsd ?? 0;
  }

  function providerStatusLabel(opportunity: BorrowOpportunity): string {
    const labels: Record<BorrowOpportunity["fundingStatus"], string> = {
      "available-now": "Available now",
      limited: "Limited availability",
      "request-required": "Request required",
      unavailable: "Unavailable",
    };
    return labels[opportunity.fundingStatus];
  }

  function providerStatusClass(opportunity: BorrowOpportunity): string {
    if (opportunity.fundingStatus === "available-now") {
      return "bg-emerald-100 text-emerald-800";
    }
    if (opportunity.fundingStatus === "unavailable") {
      return "bg-slate-100 text-slate";
    }
    return "bg-amber-100 text-amber-900";
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
      reason:
        "OWN offer requests are temporarily unavailable. Please try again later.",
    }));
    try {
      ownLeadStatus.value = await ownLeadStatusPromise;
      return ownLeadStatus.value;
    } finally {
      loadingOwnLeadStatus.value = false;
    }
  }

  onMounted(async () => {
    await ensureOwnLeadStatus();
    if (configuredFixtureMode) submit();
  });

  return {
    configuredFixtureMode,
    input,
    selectedProviderId,
    borrowAmountUsd,
    walletError,
    showSearch,
    showOwnLead,
    assetsExpanded,
    ownLeadStatus,
    landingInput,
    resultSummary,
    examples,
    estimatorMutation,
    quoteResponse,
    portfolio,
    ownOpportunity,
    providerItems,
    bestExternalId,
    maxBorrowUsd,
    usableAssets,
    usableCollateralUsd,
    conversionRequiredAssets,
    pooledPreview,
    ownLtv,
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
    actionableProviderCount,
    hasProviderOutage,
    hasActionableSelection,
    utilizationPercent,
    ownUnavailableReason,
    estimateFreshnessLabel,
    riskAnnouncement,
    submit,
    retryEstimator,
    openWalletSearch,
    toggleWalletSearch,
    connectWallet,
    useExample,
    selectProvider,
    providerCapacity,
    providerStatusLabel,
    providerStatusClass,
    formatUsd,
    formatPercent,
    friendlyEstimatorError,
  };
}
