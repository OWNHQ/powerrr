import type {
  OwnLeadRequest,
  OwnLeadResponse,
  OwnLeadStatusResponse,
} from "@powerrr/shared-types";
import { createHmac, randomUUID } from "node:crypto";

export type OwnLeadDeliveryConfig = {
  webhookUrl: string;
  webhookSecret: string;
  timeoutMs: number;
  developmentMock: boolean;
  production: boolean;
};

export type OwnLeadFetch = (
  url: string,
  init: RequestInit,
) => Promise<Pick<Response, "ok" | "status">>;

export function ownLeadStatus(
  config: OwnLeadDeliveryConfig,
): OwnLeadStatusResponse {
  if (config.webhookUrl && config.webhookSecret) {
    return { enabled: true };
  }

  if (!config.production && config.developmentMock) {
    return { enabled: true };
  }

  return {
    enabled: false,
    reason:
      "OWN offer requests are temporarily unavailable. Please try again later.",
  };
}

export async function deliverOwnLead(
  input: OwnLeadRequest,
  config: OwnLeadDeliveryConfig,
  fetchImpl: OwnLeadFetch = fetch,
): Promise<OwnLeadResponse> {
  const requestId = randomUUID();
  const status = ownLeadStatus(config);
  if (!status.enabled) {
    throw new OwnLeadDeliveryError(
      status.reason ?? "OWN offer requests are unavailable",
      503,
    );
  }

  if (!config.webhookUrl || !config.webhookSecret) {
    return {
      accepted: true,
      requestId,
      delivery: "development-mock",
    };
  }

  const payload = JSON.stringify({
    event: "own.offer-requested",
    version: "2026-07-15",
    requestId,
    idempotencyKey: input.idempotencyKey,
    submittedAt: new Date().toISOString(),
    lead: {
      email: input.email,
      wallet: input.wallet,
      requestedAmountUsd: input.requestedAmountUsd,
      creditAsset: input.creditAsset,
      termMonths: input.termMonths,
      collateral: input.collateral,
      policyVersion: input.policyVersion,
      consent: input.consent,
    },
  });
  const signature = createHmac("sha256", config.webhookSecret)
    .update(payload)
    .digest("hex");
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    boundedTimeout(config.timeoutMs),
  );

  try {
    const response = await fetchImpl(config.webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-powerrr-event": "own.offer-requested",
        "x-powerrr-idempotency-key": input.idempotencyKey,
        "x-powerrr-signature": `sha256=${signature}`,
      },
      body: payload,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new OwnLeadDeliveryError(
        `OWN lead delivery failed with status ${response.status}`,
        502,
      );
    }
  } catch (error) {
    if (error instanceof OwnLeadDeliveryError) {
      throw error;
    }
    throw new OwnLeadDeliveryError(
      error instanceof Error && error.name === "AbortError"
        ? "OWN offer request timed out"
        : "OWN offer request could not be delivered",
      error instanceof Error && error.name === "AbortError" ? 504 : 502,
    );
  } finally {
    clearTimeout(timeout);
  }

  return {
    accepted: true,
    requestId,
    delivery: "webhook",
  };
}

export function ownLeadDeliveryConfig(
  runtimeConfig: Record<string, unknown>,
): OwnLeadDeliveryConfig {
  return {
    webhookUrl: String(runtimeConfig.ownLeadWebhookUrl ?? ""),
    webhookSecret: String(runtimeConfig.ownLeadWebhookSecret ?? ""),
    timeoutMs: boundedTimeout(
      Number(runtimeConfig.ownLeadWebhookTimeoutMs ?? 5_000),
    ),
    developmentMock:
      String(runtimeConfig.ownLeadDevelopmentMock ?? "false") === "true",
    production: process.env.NODE_ENV === "production",
  };
}

export class OwnLeadDeliveryError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "OwnLeadDeliveryError";
    this.statusCode = statusCode;
  }
}

function boundedTimeout(value: number): number {
  return Number.isFinite(value)
    ? Math.min(10_000, Math.max(250, Math.trunc(value)))
    : 5_000;
}
