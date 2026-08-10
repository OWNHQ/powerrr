import {
  AAVE_V3_ETHEREUM,
  SPARKLEND_ETHEREUM,
  loadAaveLikeSnapshot,
  loadCompoundUsdcCometSnapshot,
  projectLiveSnapshots,
  quoteLiveSnapshots,
  type LiveQuoteSnapshot,
} from "@powerrr/protocol-adapters";
import { ethereumAssetMetadataByAddress } from "@powerrr/configs";
import type {
  BlockContext,
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
import { filterSmallBalances, isAssetSelectable } from "../utils/estimator-ux";
import { loadStaticMorphoSnapshot } from "../utils/static-morpho";
import { resolveWalletNames, type WalletNames } from "../utils/static-names";
import { formatCompactWalletAddress } from "../utils/wallet-identity";
import { DeadlineExceededError, withDeadline } from "../utils/promise-deadline";

type AnnouncedProvider = {
  descriptor: WalletProviderDescriptor;
  provider: Eip1193Provider;
};

type ProviderStatus = ProtocolAvailability & { label: string };

type EstimatorSnapshot = {
  block: BlockContext;
  assets: PortfolioAsset[];
  receipt: ReadReceipt;
  registrySource: string;
  walletNames: WalletNames;
  protocolSnapshots: LiveQuoteSnapshot[];
  providerStatuses: ProviderStatus[];
};

const LAST_WALLET_RDNS_KEY = "powerrr:last-wallet-rdns";
const WALLET_NAME_READ_TIMEOUT_MS = 8_000;
const PROTOCOL_SOURCE_TIMEOUT_MS = 20_000;
const WALLET_DISCOVERY_TIMEOUT_MS = 45_000;

export function useStaticEstimator() {
  const announcedProviders = shallowRef<AnnouncedProvider[]>([]);
  const selectedWallet = shallowRef<AnnouncedProvider | null>(null);
  const account = ref("");
  const progress = ref<DiscoveryProgress | null>(null);
  const estimatorSnapshot = shallowRef<EstimatorSnapshot | null>(null);
  const assets = computed(() => estimatorSnapshot.value?.assets ?? []);
  const receipt = computed(() => estimatorSnapshot.value?.receipt ?? null);
  const registrySource = computed(
    () => estimatorSnapshot.value?.registrySource ?? "",
  );
  const walletNames = computed<WalletNames>(
    () =>
      estimatorSnapshot.value?.walletNames ?? {
        ensName: null,
        gweiName: null,
      },
  );
  const providerStatuses = computed(
    () => estimatorSnapshot.value?.providerStatuses ?? [],
  );
  const error = ref("");
  const isScanning = ref(false);
  const isConnecting = ref(false);
  const connectionSlow = ref(false);
  const connectionTimedOut = ref(false);
  const isRefreshing = ref(false);
  const isComparing = ref(false);
  const walletDiscoveryComplete = ref(false);
  const selectedCollateralTokens = ref<string[]>([]);
  const walletNotice = ref("");
  const rememberedWalletRdns = ref("");
  let connectedProvider: Eip1193Provider | null = null;
  let removeConnectedListeners: (() => void) | null = null;
  let providerAnnouncementHandler: ((event: Event) => void) | null = null;
  let fallbackTimer: number | null = null;
  let connectionSlowTimer: number | null = null;
  let connectionTimeoutTimer: number | null = null;
  let connectionAttempt = 0;
  let scanAttempt = 0;
  let selectionRevision = 0;
  let scanAbortController: AbortController | null = null;
  let reconnecting = false;

  const orderedProviders = computed(() =>
    [...announcedProviders.value].sort((left, right) => {
      const leftRecent = left.descriptor.rdns === rememberedWalletRdns.value;
      const rightRecent = right.descriptor.rdns === rememberedWalletRdns.value;
      if (leftRecent !== rightRecent) return leftRecent ? -1 : 1;
      return left.descriptor.name.localeCompare(right.descriptor.name);
    }),
  );

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
        isAssetSelectable(asset) &&
        selected.has(asset.token.toLowerCase()),
    );
  });
  const quotes = computed<ProtocolBorrowQuote[]>(() => {
    const source = estimatorSnapshot.value;
    if (!source || !selectedCollateralTokens.value.length) return [];
    return quoteLiveSnapshots({
      snapshots: projectLiveSnapshots(
        source.protocolSnapshots,
        selectedCollateralTokens.value,
      ),
    });
  });
  const totalValuedUsd = computed(() =>
    valuedAssets.value.reduce(
      (sum, asset) => sum + Number(asset.balance) * (asset.marketPriceUsd ?? 0),
      0,
    ),
  );
  const compactAccount = computed(() =>
    formatCompactWalletAddress(account.value),
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
    void reconnectRememberedWallet(candidate);
  }

  async function connect(wallet: AnnouncedProvider): Promise<void> {
    if (isScanning.value || isConnecting.value) return;
    const attempt = ++connectionAttempt;
    clearResult();
    walletNotice.value = "";
    selectedWallet.value = wallet;
    connectedProvider = createReadOnlyProvider(wallet.provider);
    progress.value = {
      phase: "connecting",
      completed: 0,
      total: 1,
      message: `Waiting for ${wallet.descriptor.name} account permission.`,
    };
    isConnecting.value = true;
    isScanning.value = true;
    startConnectionTimers();
    try {
      const accounts = await connectedProvider.request<string[]>({
        method: "eth_requestAccounts",
      });
      if (attempt !== connectionAttempt) return;
      if (!accounts[0])
        throw new Error("The wallet did not expose an account.");
      account.value = accounts[0];
      attachConnectedListeners(connectedProvider);
      rememberWallet(wallet);
      stopConnectionTimers();
      isConnecting.value = false;
      await scan();
    } catch (cause) {
      if (attempt !== connectionAttempt) return;
      error.value = friendlyError(cause);
      progress.value = null;
    } finally {
      if (attempt === connectionAttempt) {
        stopConnectionTimers();
        isConnecting.value = false;
        isScanning.value = false;
      }
    }
  }

  function cancelConnection(): void {
    if (!isConnecting.value && !isScanning.value) return;
    connectionAttempt += 1;
    scanAttempt += 1;
    scanAbortController?.abort();
    scanAbortController = null;
    stopConnectionTimers();
    removeConnectedListeners?.();
    removeConnectedListeners = null;
    isConnecting.value = false;
    isScanning.value = false;
    connectedProvider = null;
    selectedWallet.value = null;
    account.value = "";
    progress.value = null;
    error.value = "";
    walletNotice.value = "Connection cancelled.";
  }

  async function scan(
    options: { preserveSelection?: boolean } = {},
  ): Promise<void> {
    if (!connectedProvider || !selectedWallet.value || !account.value) return;
    const attempt = ++scanAttempt;
    const provider = connectedProvider;
    const wallet = selectedWallet.value;
    const scanAccount = account.value;
    const refreshing = Boolean(receipt.value);
    const startingSelectionRevision = selectionRevision;
    scanAbortController?.abort();
    const abortController = new AbortController();
    scanAbortController = abortController;
    error.value = "";
    if (refreshing) isRefreshing.value = true;
    else isScanning.value = true;
    try {
      const result = await withDeadline(
        scanConnectedWallet({
          provider,
          account: scanAccount,
          walletName: wallet.descriptor.name,
          signal: abortController.signal,
          onProgress: (next) => {
            if (attempt === scanAttempt) progress.value = next;
          },
        }),
        WALLET_DISCOVERY_TIMEOUT_MS,
        "Wallet reads did not settle before the 45-second scan deadline.",
        { onDeadline: () => abortController.abort() },
      );
      if (attempt !== scanAttempt) return;
      const defaultCollateralTokens = filterSmallBalances(
        result.assets.filter(
          (asset) =>
            asset.balanceReadStatus === "success" &&
            Number(asset.balance) > 0 &&
            asset.valuationStatus === "available" &&
            ethereumAssetMetadataByAddress(asset.token)?.category !==
              "stablecoin",
        ),
      ).map((asset) => asset.token);
      const positiveAssets = result.assets.filter(
        (asset) =>
          asset.balanceReadStatus === "success" && Number(asset.balance) > 0,
      );
      const availableTokens = new Set(
        positiveAssets
          .filter((asset) => isAssetSelectable(asset))
          .map((asset) => asset.token.toLowerCase()),
      );
      progress.value = {
        phase: "providers",
        completed: 0,
        total: 5,
        message:
          "Reading names and complete protocol state at the selected block.",
      };
      let completedProviderSources = 0;
      const reportProviderSource = (label: string) => {
        completedProviderSources += 1;
        if (attempt !== scanAttempt) return;
        progress.value = {
          phase: "providers",
          completed: completedProviderSources,
          total: 5,
          message: `${label} finished. ${completedProviderSources} of 5 snapshot sources complete.`,
        };
      };
      const [names, providerSnapshot] = await Promise.all([
        withDeadline(
          resolveWalletNames({
            provider,
            account: result.receipt.account,
            blockNumber: result.receipt.blockNumber,
          }),
          WALLET_NAME_READ_TIMEOUT_MS,
          "Wallet name reads did not settle before the scan deadline.",
        )
          .catch(() => ({ ensName: null, gweiName: null }))
          .finally(() => reportProviderSource("Wallet names")),
        loadProviderSnapshots(
          provider,
          positiveAssets,
          result.receipt,
          reportProviderSource,
        ),
      ]);
      if (
        attempt !== scanAttempt ||
        connectedProvider !== provider ||
        account.value.toLowerCase() !== scanAccount.toLowerCase()
      ) {
        return;
      }
      // Publish the complete wallet and protocol snapshot atomically. Nothing
      // after this point needs the wallet provider until an explicit refresh.
      const selectionSource = options.preserveSelection
        ? selectedCollateralTokens.value
        : selectionRevision !== startingSelectionRevision
          ? selectedCollateralTokens.value
          : defaultCollateralTokens;
      const nextSelectedTokens = selectionSource.filter((token) =>
        availableTokens.has(token.toLowerCase()),
      );
      selectedCollateralTokens.value = nextSelectedTokens;
      estimatorSnapshot.value = Object.freeze({
        block: result.block,
        assets: result.assets,
        receipt: result.receipt,
        registrySource: result.registrySource,
        walletNames: names,
        protocolSnapshots: providerSnapshot.snapshots,
        providerStatuses: providerSnapshot.statuses,
      });
      progress.value = {
        phase: "complete",
        completed: result.assets.length,
        total: result.assets.length,
        message: "Scan and local calculations complete.",
      };
    } catch (cause) {
      if (attempt !== scanAttempt) return;
      error.value = friendlyError(cause);
      progress.value = null;
    } finally {
      if (attempt === scanAttempt) {
        if (scanAbortController === abortController) {
          scanAbortController = null;
        }
        if (refreshing) isRefreshing.value = false;
        else isScanning.value = false;
      }
    }
  }

  async function refresh(): Promise<void> {
    await scan({ preserveSelection: true });
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
    connectionAttempt += 1;
    scanAttempt += 1;
    scanAbortController?.abort();
    scanAbortController = null;
    stopConnectionTimers();
    removeConnectedListeners?.();
    removeConnectedListeners = null;
    connectedProvider = null;
    selectedWallet.value = null;
    account.value = "";
    clearResult();
    rememberedWalletRdns.value = "";
    window.localStorage.removeItem(LAST_WALLET_RDNS_KEY);
    walletNotice.value = "Wallet disconnected.";
  }

  function clearResult(): void {
    estimatorSnapshot.value = null;
    selectedCollateralTokens.value = [];
    progress.value = null;
    error.value = "";
  }

  function setAssetSelected(token: string, selected: boolean): void {
    const next = new Set(selectedCollateralTokens.value);
    const asset = assets.value.find(
      (candidate) => candidate.token.toLowerCase() === token.toLowerCase(),
    );
    if (selected && asset && isAssetSelectable(asset)) next.add(asset.token);
    else next.delete(token);
    selectedCollateralTokens.value = [...next];
    selectionRevision += 1;
  }

  function compareSelectedAssets(): void {
    if (!receipt.value) return;
    error.value = "";
  }

  function openExternal(href: string): void {
    window.open(href, "_blank", "noopener,noreferrer");
  }

  function attachConnectedListeners(provider: Eip1193Provider): void {
    removeConnectedListeners?.();
    const accountsChanged = (value: unknown) => {
      const next =
        Array.isArray(value) && typeof value[0] === "string" ? value[0] : "";
      if (!next) {
        disconnect();
        return;
      }
      if (next.toLowerCase() === account.value.toLowerCase()) return;
      account.value = next;
      clearResult();
      walletNotice.value = `Account changed to ${compactAddress(next)}. Reading a new one-block snapshot.`;
      void scan();
    };
    const chainChanged = (value: unknown) => {
      scanAttempt += 1;
      clearResult();
      const chainId =
        typeof value === "string" ? Number.parseInt(value, 16) : 0;
      if (chainId !== 1) {
        error.value =
          "Powerrr supports Ethereum Mainnet. Switch networks to run a new scan.";
        return;
      }
      walletNotice.value =
        "Ethereum Mainnet selected. Reading a new one-block snapshot.";
      void scan();
    };
    const disconnected = () => disconnect();
    provider.on?.("accountsChanged", accountsChanged);
    provider.on?.("chainChanged", chainChanged);
    provider.on?.("disconnect", disconnected);
    removeConnectedListeners = () => {
      provider.removeListener?.("accountsChanged", accountsChanged);
      provider.removeListener?.("chainChanged", chainChanged);
      provider.removeListener?.("disconnect", disconnected);
    };
  }

  function rememberWallet(wallet: AnnouncedProvider): void {
    rememberedWalletRdns.value = wallet.descriptor.rdns;
    window.localStorage.setItem(LAST_WALLET_RDNS_KEY, wallet.descriptor.rdns);
  }

  async function reconnectRememberedWallet(
    wallet: AnnouncedProvider,
  ): Promise<void> {
    if (
      reconnecting ||
      isScanning.value ||
      account.value ||
      !rememberedWalletRdns.value ||
      wallet.descriptor.rdns !== rememberedWalletRdns.value
    ) {
      return;
    }
    reconnecting = true;
    const provider = createReadOnlyProvider(wallet.provider);
    try {
      const accounts = await provider.request<string[]>({
        method: "eth_accounts",
      });
      if (!accounts[0]) {
        rememberedWalletRdns.value = "";
        window.localStorage.removeItem(LAST_WALLET_RDNS_KEY);
        return;
      }
      selectedWallet.value = wallet;
      connectedProvider = provider;
      account.value = accounts[0];
      attachConnectedListeners(provider);
      progress.value = {
        phase: "connecting",
        completed: 1,
        total: 1,
        message: `Reconnecting to ${wallet.descriptor.name}.`,
      };
      isScanning.value = true;
      await scan();
    } catch {
      removeConnectedListeners?.();
      removeConnectedListeners = null;
      connectedProvider = null;
      selectedWallet.value = null;
      account.value = "";
      clearResult();
    } finally {
      isScanning.value = false;
      reconnecting = false;
    }
  }

  function startConnectionTimers(): void {
    stopConnectionTimers();
    connectionSlowTimer = window.setTimeout(() => {
      connectionSlow.value = true;
    }, 5_000);
    connectionTimeoutTimer = window.setTimeout(() => {
      connectionTimedOut.value = true;
    }, 15_000);
  }

  function stopConnectionTimers(): void {
    if (connectionSlowTimer) window.clearTimeout(connectionSlowTimer);
    if (connectionTimeoutTimer) window.clearTimeout(connectionTimeoutTimer);
    connectionSlowTimer = null;
    connectionTimeoutTimer = null;
    connectionSlow.value = false;
    connectionTimedOut.value = false;
  }

  onMounted(() => {
    rememberedWalletRdns.value =
      window.localStorage.getItem(LAST_WALLET_RDNS_KEY) ?? "";
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
    stopConnectionTimers();
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
    orderedProviders,
    selectedWallet,
    rememberedWalletRdns,
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
    walletNotice,
    isScanning,
    isConnecting,
    connectionSlow,
    connectionTimedOut,
    isRefreshing,
    isComparing,
    walletDiscoveryComplete,
    connect,
    cancelConnection,
    scan,
    refresh,
    switchToMainnet,
    disconnect,
    setAssetSelected,
    compareSelectedAssets,
    openExternal,
  };
}

async function loadProviderSnapshots(
  provider: Eip1193Provider,
  portfolio: PortfolioAsset[],
  receipt: ReadReceipt,
  onSourceSettled?: (label: string) => void,
): Promise<{ snapshots: LiveQuoteSnapshot[]; statuses: ProviderStatus[] }> {
  const statuses: ProviderStatus[] = [];
  const snapshots: LiveQuoteSnapshot[] = [];
  const baseInput = {
    address: receipt.account,
    chainId: 1 as const,
    mode: "wallet-estimate" as const,
    portfolio,
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
          receipt,
        }),
    },
  ];
  const results = await Promise.all(
    loaders.map(async (loader) => {
      try {
        return {
          loader,
          snapshot: await withDeadline<LiveQuoteSnapshot>(
            loader.run() as Promise<LiveQuoteSnapshot>,
            PROTOCOL_SOURCE_TIMEOUT_MS,
            `${loader.label} did not settle before the protocol-read deadline.`,
          ),
        } as const;
      } catch (cause) {
        return { loader, cause } as const;
      } finally {
        onSourceSettled?.(loader.label);
      }
    }),
  );
  for (const result of results) {
    if ("snapshot" in result && result.snapshot) {
      if (result.snapshot.blockNumber !== receipt.blockNumber) {
        statuses.push({
          protocolId: result.loader.id,
          label: result.loader.label,
          status: "unavailable",
          code: "SOURCE_READ_FAILED",
          reason: "Protocol state did not match the selected wallet block.",
        });
        continue;
      }
      snapshots.push(result.snapshot);
      statuses.push({
        protocolId: result.loader.id,
        label: result.loader.label,
        status: "available",
      });
    } else {
      statuses.push({
        protocolId: result.loader.id,
        label: result.loader.label,
        status: "unavailable",
        code:
          result.cause instanceof DeadlineExceededError
            ? "DEADLINE_EXCEEDED"
            : "SOURCE_READ_FAILED",
        reason: friendlyError(result.cause),
      });
    }
  }
  return { snapshots, statuses };
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
      return "Connection cancelled. Choose the wallet to try again; nothing was read or stored.";
    }
    return cause.message;
  }
  return "The wallet returned an unexpected response.";
}

function compactAddress(address: string): string {
  return formatCompactWalletAddress(address);
}
