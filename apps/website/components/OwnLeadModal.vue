<script setup lang="ts">
import { PhCheckCircle, PhInfo, PhX } from "@phosphor-icons/vue";
import type {
  BorrowOpportunity,
  OwnLeadRequest,
  OwnLeadStatusResponse,
} from "@powerrr/shared-types";

const props = defineProps<{
  opportunity: BorrowOpportunity;
  wallet: string;
  amountUsd: number;
  status: OwnLeadStatusResponse;
}>();
const emit = defineEmits<{ close: [] }>();

const api = usePowerrrApi();
const email = ref("");
const requestedAmountUsd = ref(props.amountUsd);
const requestedAmountText = ref(formatAmount(props.amountUsd));
const termMonths = ref(props.opportunity.termMonths);
const consent = ref(false);
const website = ref("");
const idempotencyKey = ref("");
const status = ref<OwnLeadStatusResponse>(props.status);
const loadingStatus = ref(false);
const submitting = ref(false);
const errorMessage = ref("");
const submitted = ref(false);
const emailInput = ref<HTMLInputElement | null>(null);
const dialog = ref<HTMLElement | null>(null);
const emailError = ref("");
const amountError = ref("");
const consentError = ref("");
let previousActiveElement: HTMLElement | null = null;
let previousBodyOverflow = "";

const confirmationReference = computed(() =>
  idempotencyKey.value.slice(0, 8).toUpperCase(),
);

onMounted(async () => {
  previousActiveElement = document.activeElement as HTMLElement | null;
  previousBodyOverflow = document.body.style.overflow;
  idempotencyKey.value = crypto.randomUUID();
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", onKeydown);
  await nextTick();
  emailInput.value?.focus();
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeydown);
  document.body.style.overflow = previousBodyOverflow;
  previousActiveElement?.focus();
});

function close() {
  emit("close");
}

function onRequestedAmountInput(event: Event) {
  requestedAmountText.value = (event.target as HTMLInputElement).value;
  const parsed = Number(
    requestedAmountText.value.replaceAll(",", "").replace("$", ""),
  );
  if (Number.isFinite(parsed)) requestedAmountUsd.value = parsed;
  amountError.value = "";
}

function onRequestedAmountFocus() {
  requestedAmountText.value = String(requestedAmountUsd.value);
}

function onRequestedAmountBlur() {
  requestedAmountUsd.value = Math.max(
    0,
    Math.min(props.opportunity.potentialBorrowUsd, requestedAmountUsd.value),
  );
  requestedAmountText.value = formatAmount(requestedAmountUsd.value);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    close();
    return;
  }
  if (event.key !== "Tab" || !dialog.value) return;

  const focusable = [
    ...dialog.value.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((element) => !element.hasAttribute("hidden"));
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

async function submit() {
  if (!status.value?.enabled || submitting.value) return;
  errorMessage.value = "";
  if (!validateFields()) return;
  submitting.value = true;

  const payload: OwnLeadRequest = {
    idempotencyKey: idempotencyKey.value || crypto.randomUUID(),
    email: email.value.trim(),
    wallet: props.wallet,
    requestedAmountUsd: requestedAmountUsd.value,
    creditAsset: "USDC",
    termMonths: termMonths.value,
    collateral: props.opportunity.collateralUsed.map((item) => ({
      symbol: item.symbol,
      valueUsd: item.valueUsd,
    })),
    policyVersion: props.opportunity.policyVersion,
    consent: true,
    website: website.value,
  };

  try {
    await api.submitOwnLead(payload);
    submitted.value = true;
  } catch (error) {
    errorMessage.value = apiErrorMessage(error);
  } finally {
    submitting.value = false;
  }
}

function validateFields(): boolean {
  emailError.value = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())
    ? ""
    : "Enter a valid email address.";
  amountError.value =
    requestedAmountUsd.value >= 100 &&
    requestedAmountUsd.value <= props.opportunity.potentialBorrowUsd
      ? ""
      : `Enter an amount from $100 to ${formatUsd(props.opportunity.potentialBorrowUsd)}.`;
  consentError.value = consent.value
    ? ""
    : "Consent is required before sending the request.";
  return !emailError.value && !amountError.value && !consentError.value;
}

function apiErrorMessage(error: unknown): string {
  const response =
    typeof error === "object" && error !== null
      ? (error as {
          status?: number;
          statusCode?: number;
          data?: { error?: { code?: string } };
        })
      : {};
  const statusCode = response.statusCode ?? response.status;
  const code = response.data?.error?.code?.toUpperCase() ?? "";

  if (statusCode === 429 || code.includes("RATE_LIMIT")) {
    return "Too many requests were sent in a short time. Wait a moment and try again.";
  }
  if (statusCode === 503 || code.includes("UNAVAILABLE")) {
    return "We couldn’t send the request yet. Your details were not submitted—please try again later.";
  }
  return "The request could not be submitted. Check the form and try again.";
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 grid place-items-center bg-overlay/65 p-4 backdrop-blur-sm"
      role="presentation"
      @click.self="close"
    >
      <section
        ref="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="own-lead-title"
        aria-describedby="own-lead-description"
        class="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-surface shadow-2xl"
      >
        <header
          class="flex items-start justify-between gap-6 border-b border-line px-6 py-5"
        >
          <div>
            <p class="text-xs font-bold uppercase tracking-[0.16em] text-river">
              OWN · fixed-term
            </p>
            <h2
              id="own-lead-title"
              class="mt-2 text-2xl font-semibold tracking-tight text-ink"
            >
              {{ submitted ? "Request received" : "Start an OWN request" }}
            </h2>
            <p
              v-if="!submitted"
              id="own-lead-description"
              class="mt-2 text-sm leading-6 text-slate"
            >
              Share your indicative request with the OWN team for review and
              lender matching.
            </p>
            <p v-else id="own-lead-description" class="sr-only">
              Your indicative OWN offer request was received.
            </p>
          </div>
          <button
            type="button"
            class="focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate hover:bg-mist hover:text-ink"
            aria-label="Close"
            @click="close"
          >
            <PhX :size="22" aria-hidden="true" />
          </button>
        </header>

        <div v-if="submitted" class="px-6 py-12 text-center">
          <PhCheckCircle
            :size="52"
            weight="fill"
            class="mx-auto text-moss"
            aria-hidden="true"
          />
          <h3 class="mt-4 text-xl font-semibold">We’ll review the request</h3>
          <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-slate">
            This is not an approval or executable quote. The OWN team will use
            your details to assess fit, terms, and funding.
          </p>
          <p
            class="mt-4 text-xs font-semibold uppercase tracking-wide text-slate"
          >
            Reference {{ confirmationReference }}
          </p>
          <button
            type="button"
            class="focus-ring mt-7 rounded-lg bg-river px-6 py-3 text-sm font-semibold text-accent-contrast hover:bg-river/90"
            @click="close"
          >
            Done
          </button>
        </div>

        <form v-else class="space-y-6 px-6 py-6" @submit.prevent="submit">
          <div
            v-if="!loadingStatus && !status?.enabled"
            class="rounded-xl border border-warning-border bg-warning-surface p-4 text-sm leading-6 text-warning"
          >
            {{ status?.reason }}
          </div>

          <div class="grid gap-5 sm:grid-cols-2">
            <label class="block sm:col-span-2">
              <span class="field-label">Email address</span>
              <input
                ref="emailInput"
                v-model="email"
                type="email"
                autocomplete="email"
                required
                maxlength="254"
                class="field-control"
                placeholder="you@example.com"
                :aria-invalid="Boolean(emailError)"
                aria-describedby="email-error"
                @input="emailError = ''"
              />
              <span
                v-if="emailError"
                id="email-error"
                class="mt-2 block text-sm font-medium text-coral"
                >{{ emailError }}</span
              >
            </label>

            <label class="block sm:col-span-2">
              <span class="field-label">Public address or ENS</span>
              <input
                :value="wallet"
                type="text"
                readonly
                class="field-control bg-mist/60 text-slate"
              />
            </label>

            <label class="block">
              <span class="field-label">Requested amount (USDC)</span>
              <input
                :value="requestedAmountText"
                type="text"
                inputmode="decimal"
                required
                class="field-control"
                :aria-invalid="Boolean(amountError)"
                aria-describedby="amount-error"
                @input="onRequestedAmountInput"
                @focus="onRequestedAmountFocus"
                @blur="onRequestedAmountBlur"
              />
              <span
                v-if="amountError"
                id="amount-error"
                class="mt-2 block text-sm font-medium text-coral"
                >{{ amountError }}</span
              >
            </label>

            <div class="block">
              <span class="field-label">Indicative term</span>
              <div
                class="field-control flex items-center bg-mist/60 text-slate"
              >
                {{ termMonths }} months
              </div>
            </div>
          </div>

          <div class="rounded-xl border border-line bg-mist/45 p-4">
            <div class="flex items-center justify-between gap-4 text-sm">
              <span class="font-semibold text-ink">Collateral summary</span>
              <span class="text-slate"
                >{{ opportunity.collateralUsed.length }} assets</span
              >
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <span
                v-for="asset in opportunity.collateralUsed"
                :key="asset.token"
                class="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink"
              >
                {{ asset.symbol }} · {{ formatUsd(asset.valueUsd) }}
              </span>
            </div>
          </div>

          <div>
            <label
              class="flex items-start gap-3 rounded-xl border border-line p-4 text-sm leading-6 text-slate"
            >
              <input
                v-model="consent"
                type="checkbox"
                required
                class="mt-1 h-5 w-5 shrink-0 accent-river"
                :aria-invalid="Boolean(consentError)"
                aria-describedby="consent-error lead-data-use"
                @change="consentError = ''"
              />
              <span>
                I consent to sharing the submitted information with the OWN team
                so they can review and respond to this request.
                <a
                  href="#lead-data-use"
                  class="focus-ring rounded font-semibold text-river underline underline-offset-2"
                  >How we use this data</a
                >
              </span>
            </label>
            <span
              v-if="consentError"
              id="consent-error"
              class="mt-2 block text-sm font-medium text-coral"
              >{{ consentError }}</span
            >
          </div>

          <details
            id="lead-data-use"
            class="rounded-xl border border-line bg-mist/45 px-4 py-2 text-sm leading-6 text-slate"
          >
            <summary
              class="focus-ring min-h-11 cursor-pointer rounded-md py-2 font-semibold text-river"
            >
              How we use this data
            </summary>
            <p class="pb-3">
              The email, public address, requested amount, term, and collateral
              summary are sent to the OWN team only to review this request and
              follow up about potential terms. Submitting does not approve a
              loan or create a transaction.
            </p>
          </details>

          <label
            class="absolute -left-[10000px] top-auto h-px w-px overflow-hidden"
            aria-hidden="true"
          >
            Website
            <input
              v-model="website"
              type="text"
              name="website"
              tabindex="-1"
              autocomplete="off"
            />
          </label>

          <div
            class="flex items-start gap-2 rounded-xl bg-info-surface p-3 text-xs leading-5 text-info"
          >
            <PhInfo :size="18" class="mt-0.5 shrink-0" aria-hidden="true" />
            <p>
              Indicative only. Final availability, APR, duration, documentation,
              and acceptance depend on review and lender matching.
            </p>
          </div>

          <p
            v-if="errorMessage"
            role="alert"
            class="text-sm font-medium text-coral"
          >
            {{ errorMessage }}
          </p>

          <button
            type="submit"
            class="focus-ring flex h-12 w-full items-center justify-center rounded-lg bg-river px-5 text-sm font-semibold text-accent-contrast hover:bg-river/90 disabled:cursor-not-allowed disabled:bg-slate/35 disabled:text-slate"
            :disabled="loadingStatus || !status?.enabled || submitting"
          >
            {{ submitting ? "Sending request…" : "Send request to OWN" }}
          </button>
        </form>
      </section>
    </div>
  </Teleport>
</template>
