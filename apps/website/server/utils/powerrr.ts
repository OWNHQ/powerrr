import {
  createPowerrrEngine,
  PowerrrEngineError,
  toPowerrrEngineError,
} from "@powerrr/engine-sdk";
import type { ApiError, RuntimeTier } from "@powerrr/shared-types";
import {
  createError,
  getHeader,
  setHeader,
  setResponseStatus,
  type H3Event,
} from "h3";
import { resolveEngineDataMode } from "./engine-mode-core.js";
import {
  isValidInternalSignature,
  isValidInternalToken,
} from "./internal-auth-core.js";
import { createNuxtLiveEngineDependencies } from "./live-engine-dependencies.js";
import {
  useLiveSourceClients,
  useSourceReadiness,
} from "./source-readiness.js";

export function usePowerrrEngine() {
  const config = useRuntimeConfig();
  const sourceReadiness = useSourceReadiness();
  const dataMode = resolveEngineDataMode(
    config.powerrrDataMode,
    sourceReadiness,
  );

  return createPowerrrEngine({
    dataMode,
    runtimeTier: runtimeTierValue(config.powerrrRuntimeTier, dataMode),
    ownOpportunityConfig: {
      availableLiquidityUsd: finiteNumber(config.ownAvailableLiquidityUsd, 0),
      indicativeApr: finiteNumber(config.ownIndicativeApr, 0.065),
      termMonths: positiveInteger(config.ownTermMonths, 24),
    },
    ...(dataMode === "live"
      ? {
          dependencies: createNuxtLiveEngineDependencies(
            useLiveSourceClients(),
          ),
        }
      : {}),
  });
}

function runtimeTierValue(
  value: unknown,
  dataMode: "fixtures" | "live",
): RuntimeTier {
  if (dataMode === "fixtures") return "fixture";
  return value === "production" ? "production" : "public-rpc-preview";
}

function finiteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function handleApiError(
  event: H3Event,
  error: unknown,
): { error: ApiError } {
  const requestId = getHeader(event, "x-request-id") || crypto.randomUUID();
  setHeader(event, "x-request-id", requestId);
  if (isH3Error(error)) {
    const statusCode = numericProperty(error, "statusCode") ?? 500;
    const statusMessage =
      stringProperty(error, "statusMessage") ?? "Request failed";
    const apiError =
      apiErrorFromH3Error(error) ??
      ({
        code:
          statusCode === 429
            ? "RATE_LIMITED"
            : statusCode === 401
              ? "UNAUTHORIZED"
              : "INTERNAL_ERROR",
        message: statusMessage,
      } satisfies ApiError);

    setResponseStatus(event, statusCode, statusMessage);
    return {
      error: {
        ...apiError,
        message: publicErrorMessage(apiError.code, apiError.message),
        requestId,
      },
    };
  }

  const engineError =
    error instanceof PowerrrEngineError ? error : toPowerrrEngineError(error);
  setResponseStatus(event, engineError.statusCode, engineError.message);
  const apiError = engineError.toApiError();
  return {
    error: {
      code: apiError.code,
      message: publicErrorMessage(apiError.code, apiError.message),
      requestId,
      ...(engineError.statusCode < 500 && apiError.details !== undefined
        ? { details: apiError.details }
        : {}),
    },
  };
}

function publicErrorMessage(code: ApiError["code"], fallback: string): string {
  if (code === "ENS_RESOLUTION_FAILED") {
    return "We could not resolve that ENS name. Check the spelling or use a 0x address.";
  }
  if (code === "PROTOCOL_SOURCE_UNAVAILABLE") {
    return "Live provider data is temporarily unavailable. Try again shortly.";
  }
  if (
    code === "PORTFOLIO_UNAVAILABLE" ||
    code === "SERVICE_UNAVAILABLE" ||
    code === "INTERNAL_ERROR"
  ) {
    return "The estimate is temporarily unavailable. Try again shortly.";
  }
  return fallback;
}

function isH3Error(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    "statusMessage" in error
  );
}

function apiErrorFromH3Error(error: unknown): ApiError | null {
  if (typeof error !== "object" || error === null || !("data" in error)) {
    return null;
  }

  const data = (error as { data?: unknown }).data;
  if (typeof data !== "object" || data === null || !("error" in data)) {
    return null;
  }

  const nested = (data as { error?: unknown }).error;
  if (typeof nested !== "object" || nested === null) {
    return null;
  }

  const code = stringProperty(nested, "code");
  const message = stringProperty(nested, "message");
  if (!code || !message) {
    return null;
  }

  return {
    code: code as ApiError["code"],
    message,
  };
}

function numericProperty(value: unknown, key: string): number | null {
  if (typeof value !== "object" || value === null || !(key in value)) {
    return null;
  }

  const property = (value as Record<string, unknown>)[key];
  return typeof property === "number" ? property : null;
}

function stringProperty(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null || !(key in value)) {
    return null;
  }

  const property = (value as Record<string, unknown>)[key];
  return typeof property === "string" ? property : null;
}

export function requireInternalAuth(event: H3Event, body: unknown): void {
  const config = useRuntimeConfig();
  const expected = String(config.powerrrInternalApiToken ?? "");
  const signingSecret = String(config.powerrrInternalSigningSecret ?? "");
  const method = event.node.req.method ?? "POST";
  const path = event.node.req.url ?? "/";

  if (
    isValidInternalSignature({
      method,
      path,
      body,
      secret: signingSecret,
      timestampMs: getHeader(event, "x-powerrr-internal-timestamp") ?? "",
      provided: getHeader(event, "x-powerrr-internal-signature"),
    })
  ) {
    return;
  }

  if (
    isValidInternalToken(getHeader(event, "x-powerrr-internal-token"), expected)
  ) {
    return;
  }

  throw createError({
    statusCode: 401,
    statusMessage: "Internal endpoint requires a valid signed service request",
    data: {
      error: {
        code: "UNAUTHORIZED",
        message: "Internal endpoint requires a valid signed service request",
      },
    },
  });
}
