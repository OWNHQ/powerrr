import {
  AAVE_V3_ETHEREUM,
  SPARKLEND_ETHEREUM,
  loadAaveLikeSnapshot,
  loadCompoundUsdcCometSnapshot,
  quoteLiveSnapshots,
  type LiveQuoteSnapshot,
} from "@powerrr/protocol-adapters";
import type {
  DiscoveryProgress,
  PortfolioAsset,
  ProtocolAvailability,
  ProtocolBorrowQuote,
  ReadReceipt,
  WalletProviderDescriptor,
} from "@powerrr/shared-types";
import {
  createReadOnlyProvider,
  scanConnectedWallet,
  type Eip1193Provider,
} from "../utils/static-discovery";
import { filterSmallBalances } from "../utils/estimator-ux";
import { loadStaticMorphoSnapshot } from "../utils/static-morpho";
import { resolveWalletNames, type WalletNames } from "../utils/static-names";

type AnnouncedProvider = {
  descriptor: WalletProviderDescriptor;
  provider: Eip1193Provider;
};

type ProviderStatus = ProtocolAvailability & { label: string };

export function useStaticEstimator() {
  const announcedProviders = shallowRef<AnnouncedProvider[]>([]);
  const selectedWallet = shallowRef<AnnouncedProvider | null>(null);
  const account = ref("");
  const progress = ref<DiscoveryProgress | null>(null);
  const assets = shallowRef<PortfolioAsset[]>([]);
  const receipt = shallowRef<ReadReceipt | null>(null);
  const registrySource = ref("");
  const walletNames = shallowRef<WalletNames>({
    ensName: null,
    gweiName: null,
  });
  const quotes = shallowRef<ProtocolBorrowQuote[]>([]);
  const providerStatuses = shallowRef<ProviderStatus[]>([]);
  const error = ref("");
  const isScanning = ref(false);
  const isComparing = ref(false);
  const walletDiscoveryComplete = ref(false);
  const selectedCollateralTokens = ref<string[]>([]);
  const comparedCollateralKey = ref("");
  let connectedProvider: Eip1193Provider | null = null;
  let removeConnectedListeners: (() => void) | null = null;
  let providerAnnouncementHandler: ((event: Event) => void) | null = null;
  let fallbackTimer: number | null = null;

  const valuedAssets = computed(() =>
    filterSmallBalances(
      assets.value.filter(
        (asset) =>
          asset.balanceReadStatus === "success" &&
          Number(asset.balance) > 0 &&
          asset.valuationStatus === "available",
      ),
    ),
  );
  const manualReviewAssets = computed(() =>
    assets.value.filter(
      (asset) =>
        asset.balanceReadStatus === "success" &&
        Number(asset.balance) > 0 &&
        asset.valuationStatus !== "available",
    ),
  );
  const failedAssets = computed(() =>
    assets.value.filter((asset) => asset.balanceReadStatus === "failed"),
  );
  const selectedAssets = computed(() => {
    const selected = new Set(
      selectedCollateralTokens.value.map((token) => token.toLowerCase()),
    );
    return assets.value.filter(
      (asset) =>
        asset.balanceReadStatus === "success" &&
        Number(asset.balance) > 0 &&
        selected.has(asset.token.toLowerCase()),
    );
  });
  const selectedCollateralKey = computed(() =>
    collateralSelectionKey(selectedCollateralTokens.value),
  );
  const totalValuedUsd = computed(() =>
    valuedAssets.value.reduce(
      (sum, asset) => sum + Number(asset.balance) * (asset.marketPriceUsd ?? 0),
      0,
    ),
  );
  const compactAccount = computed(() =>
    account.value
      ? `${account.value.slice(0, 6)}…${account.value.slice(-4)}`
      : "",
  );
  const resolvedWalletNames = computed(() =>
    [walletNames.value.ensName, walletNames.value.gweiName].filter(
      (name): name is string => Boolean(name),
    ),
  );

  function addProvider(candidate: AnnouncedProvider): void {
    if (
      announcedProviders.value.some(
        (item) => item.descriptor.uuid === candidate.descriptor.uuid,
      )
    ) {
      return;
    }
    announcedProviders.value = [...announcedProviders.value, candidate];
  }

  async function connect(wallet: AnnouncedProvider): Promise<void> {
    if (isScanning.value) return;
    clearResult();
    selectedWallet.value = wallet;
    connectedProvider = createReadOnlyProvider(wallet.provider);
    progress.value = {
      phase: "connecting",
      completed: 0,
      total: 1,
      message: `Waiting for ${wallet.descriptor.name} account permission.`,
    };
    isScanning.value = true;
    try {
      const accounts = await connectedProvider.request<string[]>({
        method: "eth_requestAccounts",
      });
      if (!accounts[0])
        throw new Error("The wallet did not expose an account.");
      account.value = accounts[0];
      attachConnectedListeners(connectedProvider);
      await scan();
    } catch (cause) {
      error.value = friendlyError(cause);
      progress.value = null;
    } finally {
      isScanning.value = false;
    }
  }

  async function scan(): Promise<void> {
    if (!connectedProvider || !selectedWallet.value || !account.value) return;
    error.value = "";
    isScanning.value = true;
    try {
      const result = await scanConnectedWallet({
        provider: connectedProvider,
        account: account.value,
        walletName: selectedWallet.value.descriptor.name,
        onProgress: (next) => {
          progress.value = next;
        },
      });
      const defaultCollateralTokens = filterSmallBalances(
        result.assets.filter(
          (asset) =>
            asset.balanceReadStatus === "success" &&
            Number(asset.balance) > 0 &&
            asset.valuationStatus === "available",
        ),
      ).map((asset) => asset.token);
      progress.value = {
        phase: "providers",
        completed: 0,
        total: 1,
        message: "Checking your onchain name through your wallet provider.",
      };
      const names = await resolveWalletNames({
        provider: connectedProvider,
        account: result.receipt.account,
        blockNumber: result.receipt.blockNumber,
      });

      // Publish the receipt only after name resolution, so the header reveals
      // either the final onchain name or the address without swapping between them.
      walletNames.value = names;
      assets.value = result.assets;
      receipt.value = result.receipt;
      registrySource.value = result.registrySource;
      selectedCollateralTokens.value = defaultCollateralTokens;
      comparedCollateralKey.value = "";
      progress.value = {
        phase: "providers",
        completed: 1,
        total: 6,
        message: "Checking borrowing options through your wallet provider.",
      };
      const comparisons = await loadProviderComparisons(
        connectedProvider,
        result.assets.filter(
          (asset) =>
            asset.balanceReadStatus === "success" && Number(asset.balance) > 0,
        ),
        defaultCollateralTokens,
        result.receipt,
      );
      quotes.value = comparisons.quotes;
      providerStatuses.value = comparisons.statuses;
      comparedCollateralKey.value = selectedCollateralKey.value;
      progress.value = {
        phase: "complete",
        completed: result.assets.length,
        total: result.assets.length,
        message: "Scan and local calculations complete.",
      };
    } catch (cause) {
      error.value = friendlyError(cause);
      progress.value = null;
    } finally {
      isScanning.value = false;
    }
  }

  async function switchToMainnet(): Promise<void> {
    if (!connectedProvider) return;
    error.value = "";
    try {
      await connectedProvider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x1" }],
      });
      await scan();
    } catch (cause) {
      error.value = friendlyError(cause);
    }
  }

  function disconnect(): void {
    removeConnectedListeners?.();
    removeConnectedListeners = null;
    connectedProvider = null;
    selectedWallet.value = null;
    account.value = "";
    clearResult();
  }

  function clearResult(): void {
    assets.value = [];
    receipt.value = null;
    registrySource.value = "";
    walletNames.value = { ensName: null, gweiName: null };
    quotes.value = [];
    providerStatuses.value = [];
    selectedCollateralTokens.value = [];
    comparedCollateralKey.value = "";
    progress.value = null;
    error.value = "";
  }

  function setAssetSelected(token: string, selected: boolean): void {
    const next = new Set(selectedCollateralTokens.value);
    if (selected) next.add(token);
    else next.delete(token);
    selectedCollateralTokens.value = [...next];
  }

  async function compareSelectedAssets(): Promise<void> {
    if (!connectedProvider || !receipt.value) return;
    if (selectedCollateralKey.value === comparedCollateralKey.value) return;
    if (!selectedAssets.value.length) {
      quotes.value = [];
      providerStatuses.value = [];
      comparedCollateralKey.value = selectedCollateralKey.value;
      return;
    }
    error.value = "";
    isComparing.value = true;
    try {
      const comparisons = await loadProviderComparisons(
        connectedProvider,
        assets.value.filter(
          (asset) =>
            asset.balanceReadStatus === "success" && Number(asset.balance) > 0,
        ),
        selectedCollateralTokens.value,
        receipt.value,
      );
      quotes.value = comparisons.quotes;
      providerStatuses.value = comparisons.statuses;
      comparedCollateralKey.value = selectedCollateralKey.value;
    } catch (cause) {
      error.value = friendlyError(cause);
    } finally {
      isComparing.value = false;
    }
  }

  function openExternal(href: string): void {
    window.open(href, "_blank", "noopener,noreferrer");
  }

  function attachConnectedListeners(provider: Eip1193Provider): void {
    removeConnectedListeners?.();
    const invalidate = () => {
      clearResult();
      error.value =
        "The wallet account or network changed. Run a new scan so every read uses one consistent account and block.";
      void provider
        .request<string[]>({ method: "eth_accounts" })
        .then((next) => {
          account.value = next[0] ?? "";
        });
    };
    const disconnected = () => disconnect();
    provider.on?.("accountsChanged", invalidate);
    provider.on?.("chainChanged", invalidate);
    provider.on?.("disconnect", disconnected);
    removeConnectedListeners = () => {
      provider.removeListener?.("accountsChanged", invalidate);
      provider.removeListener?.("chainChanged", invalidate);
      provider.removeListener?.("disconnect", disconnected);
    };
  }

  onMounted(() => {
    providerAnnouncementHandler = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | {
            info?: {
              uuid?: string;
              name?: string;
              rdns?: string;
              icon?: string;
            };
            provider?: Eip1193Provider;
          }
        | undefined;
      if (!detail?.provider || !detail.info?.uuid || !detail.info.name) return;
      addProvider({
        descriptor: {
          uuid: detail.info.uuid,
          name: detail.info.name,
          rdns: detail.info.rdns ?? "unknown",
          ...(safeWalletIcon(detail.info.icon)
            ? { icon: detail.info.icon }
            : {}),
        },
        provider: detail.provider,
      });
    };
    window.addEventListener(
      "eip6963:announceProvider",
      providerAnnouncementHandler,
    );
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    fallbackTimer = window.setTimeout(() => {
      if (!announcedProviders.value.length && window.ethereum) {
        addProvider({
          descriptor: {
            uuid: "legacy-window-ethereum",
            name: "Browser wallet",
            rdns: "legacy.window.ethereum",
          },
          provider: window.ethereum,
        });
      }
      walletDiscoveryComplete.value = true;
    }, 350);
  });

  onBeforeUnmount(() => {
    removeConnectedListeners?.();
    if (providerAnnouncementHandler) {
      window.removeEventListener(
        "eip6963:announceProvider",
        providerAnnouncementHandler,
      );
    }
    if (fallbackTimer) window.clearTimeout(fallbackTimer);
  });

  return {
    announcedProviders,
    selectedWallet,
    account,
    compactAccount,
    resolvedWalletNames,
    progress,
    assets,
    valuedAssets,
    manualReviewAssets,
    failedAssets,
    selectedAssets,
    selectedCollateralTokens,
    receipt,
    registrySource,
    totalValuedUsd,
    quotes,
    providerStatuses,
    error,
    isScanning,
    isComparing,
    walletDiscoveryComplete,
    connect,
    scan,
    switchToMainnet,
    disconnect,
    setAssetSelected,
    compareSelectedAssets,
    openExternal,
  };
}

function collateralSelectionKey(tokens: string[]): string {
  return [...new Set(tokens.map((token) => token.toLowerCase()))]
    .sort()
    .join(",");
}

async function loadProviderComparisons(
  provider: Eip1193Provider,
  portfolio: PortfolioAsset[],
  selectedCollateralTokens: string[],
  receipt: ReadReceipt,
): Promise<{ quotes: ProtocolBorrowQuote[]; statuses: ProviderStatus[] }> {
  const statuses: ProviderStatus[] = [];
  const snapshots: LiveQuoteSnapshot[] = [];
  const baseInput = {
    address: receipt.account,
    chainId: 1 as const,
    mode: "wallet-estimate" as const,
    portfolio,
    selectedCollateralTokens: selectedCollateralTokens as `0x${string}`[],
    targetBorrowAssets: ["USDC"],
    safetyProfile: "balanced" as const,
    asOfBlock: receipt.blockNumber,
    blockTimestamp: receipt.blockTimestamp,
    rpc: provider,
  };
  const loaders = [
    {
      id: "aave-v3",
      label: "Aave",
      run: () =>
        loadAaveLikeSnapshot({ ...baseInput, deployment: AAVE_V3_ETHEREUM }),
    },
    {
      id: "sparklend",
      label: "Spark",
      run: () =>
        loadAaveLikeSnapshot({ ...baseInput, deployment: SPARKLEND_ETHEREUM }),
    },
    {
      id: "compound-iii",
      label: "Compound",
      run: () => loadCompoundUsdcCometSnapshot(baseInput),
    },
    {
      id: "morpho-blue",
      label: "Morpho",
      run: () =>
        loadStaticMorphoSnapshot({
          provider,
          portfolio,
          selectedCollateralTokens,
          receipt,
        }),
    },
  ];
  for (const loader of loaders) {
    try {
      snapshots.push(await loader.run());
      statuses.push({
        protocolId: loader.id,
        label: loader.label,
        status: "available",
      });
    } catch (cause) {
      statuses.push({
        protocolId: loader.id,
        label: loader.label,
        status: "unavailable",
        code: "SOURCE_READ_FAILED",
        reason: friendlyError(cause),
      });
    }
  }
  return { quotes: quoteLiveSnapshots({ snapshots }), statuses };
}

function safeWalletIcon(icon: string | undefined): boolean {
  return Boolean(
    icon &&
    /^data:image\/(?:png|jpeg|webp);base64,/i.test(icon) &&
    icon.length < 100_000,
  );
}

function friendlyError(cause: unknown): string {
  if (cause instanceof Error) {
    if (/user rejected|denied|4001/i.test(cause.message)) {
      return "The wallet permission request was declined. Nothing was read or stored.";
    }
    return cause.message;
  }
  return "The wallet returned an unexpected response.";
}
