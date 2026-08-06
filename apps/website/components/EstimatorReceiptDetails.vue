<script setup lang="ts">
import { PhCaretDown, PhInfo } from "@phosphor-icons/vue";

defineProps<{
  walletName: string;
  walletIdentityLabel: string;
  blockNumber: string | number;
  blockTimestamp: string;
  blockLoadedAtLabel: string;
  callsSucceeded: number;
  callsAttempted: number;
  registryVersion: string;
  registrySource: string;
}>();
</script>

<template>
  <details class="panel overflow-hidden" data-estimate-details>
    <summary
      class="focus-ring flex min-h-14 cursor-pointer items-center gap-2 px-5 py-4 text-sm font-semibold sm:px-6"
    >
      <PhInfo :size="18" aria-hidden="true" />
      About this estimate
      <PhCaretDown :size="14" class="ml-auto" aria-hidden="true" />
    </summary>
    <div
      class="grid gap-5 border-t border-line px-5 py-5 text-sm sm:grid-cols-2 sm:px-6 lg:grid-cols-5"
    >
      <div class="min-w-0">
        <p class="text-slate">Wallet</p>
        <p
          class="mt-1 truncate whitespace-nowrap font-semibold"
          :title="`${walletName} · ${walletIdentityLabel}`"
        >
          {{ walletName }} · {{ walletIdentityLabel }}
        </p>
      </div>
      <div>
        <p class="text-slate">Ethereum block</p>
        <p class="mt-1 font-semibold">
          {{ blockNumber }} ·
          <time :datetime="blockTimestamp">
            Loaded {{ blockLoadedAtLabel }}
          </time>
        </p>
      </div>
      <div>
        <p class="text-slate">Balance calls</p>
        <p class="mt-1 font-semibold">
          {{ callsSucceeded }}/{{ callsAttempted }} succeeded
        </p>
      </div>
      <div>
        <p class="text-slate">Asset registry</p>
        <p class="mt-1 font-semibold" :title="registrySource">
          {{ registryVersion }}
        </p>
      </div>
      <div>
        <p class="text-slate">Privacy</p>
        <p class="mt-1 font-semibold text-moss">
          No account, balance, or request was posted to Powerrr.
        </p>
      </div>
    </div>
  </details>
</template>
