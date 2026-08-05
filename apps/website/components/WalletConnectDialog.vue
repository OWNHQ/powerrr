<script setup lang="ts">
import { PhWallet, PhX } from "@phosphor-icons/vue";
import type { WalletProviderDescriptor } from "@powerrr/shared-types";
import type { Eip1193Provider } from "../utils/static-discovery";

type WalletChoice = {
  descriptor: WalletProviderDescriptor;
  provider: Eip1193Provider;
};

defineProps<{
  wallets: WalletChoice[];
  discoveryComplete: boolean;
  rememberedWalletRdns?: string;
}>();

const emit = defineEmits<{ select: [wallet: WalletChoice] }>();
const dialog = ref<HTMLDialogElement | null>(null);
let trigger: HTMLElement | null = null;

function open(source?: HTMLElement | null): void {
  trigger = source ?? (document.activeElement as HTMLElement | null);
  if (!dialog.value?.open) dialog.value?.showModal();
}

function close(): void {
  if (dialog.value?.open) dialog.value.close();
}

function restoreFocus(): void {
  trigger?.focus();
  trigger = null;
}

function select(wallet: WalletChoice): void {
  emit("select", wallet);
  close();
}

function closeFromBackdrop(event: MouseEvent): void {
  if (event.target === dialog.value) close();
}

defineExpose({ open, close });
</script>

<template>
  <dialog
    ref="dialog"
    class="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-ink shadow-panel backdrop:bg-overlay/45"
    aria-labelledby="wallet-dialog-title"
    @click="closeFromBackdrop"
    @close="restoreFocus"
  >
    <div
      class="flex items-start justify-between gap-4 border-b border-line p-5"
    >
      <div>
        <h2 id="wallet-dialog-title" class="type-title">Choose a wallet</h2>
        <p class="mt-1 text-sm leading-6 text-slate">
          Powerrr only requests your public address and read-only Ethereum data.
        </p>
      </div>
      <button
        type="button"
        class="focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate hover:bg-mist hover:text-ink"
        aria-label="Close wallet selection"
        @click="close"
      >
        <PhX :size="20" aria-hidden="true" />
      </button>
    </div>

    <div class="p-3">
      <p
        v-if="!discoveryComplete && !wallets.length"
        class="px-3 py-8 text-center text-sm text-slate"
        role="status"
      >
        Looking for browser wallets…
      </p>
      <div v-else-if="wallets.length" class="grid gap-1">
        <button
          v-for="wallet in wallets"
          :key="wallet.descriptor.uuid"
          type="button"
          class="focus-ring flex min-h-14 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-mist"
          @click="select(wallet)"
        >
          <img
            v-if="wallet.descriptor.icon"
            :src="wallet.descriptor.icon"
            alt=""
            class="h-8 w-8 rounded-lg"
          />
          <span
            v-else
            class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-mist text-river"
          >
            <PhWallet :size="19" aria-hidden="true" />
          </span>
          <span class="min-w-0 flex-1">
            <strong class="block truncate text-sm">{{
              wallet.descriptor.name
            }}</strong>
            <span
              v-if="wallet.descriptor.rdns === rememberedWalletRdns"
              class="mt-0.5 block text-xs text-slate"
            >
              Recently used
            </span>
          </span>
        </button>
      </div>
      <div v-else class="px-3 py-6 text-center">
        <p class="font-semibold">No browser wallet detected</p>
        <p class="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate">
          Open Powerrr inside your wallet’s browser, or install a wallet that
          supports Ethereum browser connections.
        </p>
      </div>
    </div>

    <div
      class="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4 text-xs text-slate"
    >
      <span>No signature or transaction is requested.</span>
      <a
        href="https://ethereum.org/wallets/"
        target="_blank"
        rel="noopener noreferrer"
        class="focus-ring rounded font-semibold text-river underline-offset-4 hover:underline"
      >
        What is a wallet?
      </a>
    </div>
  </dialog>
</template>
