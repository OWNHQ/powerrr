<script setup lang="ts">
import { PhArrowSquareOut, PhCaretDown } from "@phosphor-icons/vue";
import { formatUsdValue } from "../utils/estimator-ux";

defineProps<{
  amountUsd: number;
  minimumRequestUsd: number;
  actionable: boolean;
  expanded: boolean;
}>();

const emit = defineEmits<{ toggle: [] }>();
</script>

<template>
  <article
    data-protocol-id="own"
    class="overflow-hidden rounded-xl border border-line bg-surface"
  >
    <button
      type="button"
      class="focus-ring w-full px-4 py-4 text-left sm:px-5"
      :aria-expanded="expanded"
      aria-controls="own-comparison-details"
      @click="emit('toggle')"
    >
      <span class="flex items-start justify-between gap-4">
        <span>
          <strong class="type-subtitle block">OWN</strong>
          <span
            class="mt-1 block text-xs font-semibold"
            :class="actionable ? 'text-moss' : 'text-slate'"
            >{{
              actionable
                ? "Direct borrowing assessment"
                : "Direct assessment preview"
            }}</span
          >
        </span>
        <PhCaretDown
          :size="18"
          class="mt-1 text-slate transition-transform duration-200"
          :class="expanded ? 'rotate-180' : ''"
          aria-hidden="true"
        />
      </span>
      <span class="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <span
          ><span class="type-metric-label block text-slate">Requested</span
          ><strong class="type-data">{{
            formatUsdValue(amountUsd)
          }}</strong></span
        >
        <span
          ><span class="type-metric-label block text-slate">Asset scope</span
          ><strong class="type-value">Any asset considered</strong></span
        >
        <span
          ><span class="type-metric-label block text-slate">Loan structure</span
          ><strong class="type-value">Fixed term</strong></span
        >
        <span
          ><span class="type-metric-label block text-slate">Quote</span
          ><strong class="type-value">Direct from OWN</strong></span
        >
      </span>
    </button>

    <div
      class="flex min-h-14 items-center justify-end border-t border-line bg-mist/30 px-4 py-2 sm:px-5"
      data-provider-action
    >
      <a
        v-if="actionable"
        href="https://own.casa/borrow#contact"
        target="_blank"
        rel="noopener noreferrer"
        class="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-semibold text-own hover:border-own"
      >
        Discuss this request with OWN
        <PhArrowSquareOut :size="17" aria-hidden="true" />
      </a>
      <button
        v-else
        type="button"
        disabled
        class="inline-flex min-h-11 cursor-not-allowed items-center justify-center rounded-lg border border-line bg-surface px-4 text-sm font-semibold text-slate opacity-60"
      >
        Available above {{ formatUsdValue(minimumRequestUsd) }}
      </button>
    </div>

    <Transition name="provider-disclosure">
      <div v-if="expanded" class="provider-disclosure" data-provider-disclosure>
        <div class="min-h-0 overflow-hidden">
          <div
            id="own-comparison-details"
            class="border-t border-line px-4 py-5 sm:px-5"
          >
            <section aria-labelledby="own-assessment-title">
              <h3 id="own-assessment-title" class="font-semibold">
                How an OWN assessment works
              </h3>
              <ol class="mt-4 grid gap-5 sm:grid-cols-3 sm:gap-6">
                <li class="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3">
                  <span
                    class="grid h-7 w-7 place-items-center rounded-full bg-ownsoft text-xs font-semibold text-own"
                    aria-hidden="true"
                    >1</span
                  >
                  <div>
                    <h4 class="text-sm font-semibold">Discuss the case</h4>
                    <p class="mt-1 text-xs leading-5 text-slate">
                      Share the borrowing need and proposed crypto collateral
                      with OWN. This starts a high-touch feasibility review, not
                      an approval.
                    </p>
                  </div>
                </li>
                <li class="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3">
                  <span
                    class="grid h-7 w-7 place-items-center rounded-full bg-ownsoft text-xs font-semibold text-own"
                    aria-hidden="true"
                    >2</span
                  >
                  <div>
                    <h4 class="text-sm font-semibold">Define the structure</h4>
                    <p class="mt-1 text-xs leading-5 text-slate">
                      If the case can proceed, OWN and the relevant parties
                      define the eligible collateral, stablecoin loan amount,
                      fixed rate, term, repayment schedule, asset control,
                      servicing, and default treatment.
                    </p>
                  </div>
                </li>
                <li class="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3">
                  <span
                    class="grid h-7 w-7 place-items-center rounded-full bg-ownsoft text-xs font-semibold text-own"
                    aria-hidden="true"
                    >3</span
                  >
                  <div>
                    <h4 class="text-sm font-semibold">
                      Review before proceeding
                    </h4>
                    <p class="mt-1 text-xs leading-5 text-slate">
                      Review the proposed structure, responsibilities, and risk
                      disclosures before deciding whether to continue.
                      Availability depends on eligibility, capital, partner, and
                      jurisdiction checks.
                    </p>
                  </div>
                </li>
              </ol>
              <p
                class="mt-5 border-t border-line pt-4 text-xs leading-5 text-slate"
              >
                Powerrr does not send your wallet data to OWN, submit an
                application, pre-approve the request, or estimate OWN’s terms.
              </p>
            </section>
          </div>
        </div>
      </div>
    </Transition>
  </article>
</template>
