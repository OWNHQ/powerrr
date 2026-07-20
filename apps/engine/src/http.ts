import {
  createPowerrrEngine,
  type PowerrrEngine,
  toPowerrrEngineError,
} from "@powerrr/engine-sdk";
import type { ApiError } from "@powerrr/shared-types";
import { createHmac, createHash, timingSafeEqual } from "node:crypto";

const DEFAULT_LOCAL_INTERNAL_TOKEN = "local-dev-internal-token";

export type HeaderBag = Record<string, string | string[] | undefined>;

export type EngineHttpRequest = {
  method: string;
  path: string;
  body?: unknown;
  headers?: HeaderBag;
  remoteAddress?: string;
};

export type EngineHttpResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
};

export type EngineHttpHandlerOptions = {
  engine?: PowerrrEngine;
  signingSecret?: string;
  internalToken?: string;
  now?: () => Date;
  publicLimit?: number;
  internalLimit?: number;
  allowLocalInternalToken?: boolean;
};

type RouteConfig = {
  cacheTtlMs?: number;
  internal?: boolean;
  rateLimitScope: "public" | "internal";
};

type CacheEntry = {
  expiresAt: number;
  response: EngineHttpResponse;
};

type RateEntry = {
  count: number;
  resetAt: number;
};

export function createEngineHttpHandler(
  options: EngineHttpHandlerOptions = {},
) {
  const engine = options.engine ?? createPowerrrEngine();
  const now = options.now ?? (() => new Date());
  const cache = new Map<string, CacheEntry>();
  const rateLimits = new Map<string, RateEntry>();

  return async function handleEngineHttpRequest(
    request: EngineHttpRequest,
  ): Promise<EngineHttpResponse> {
    const method = request.method.toUpperCase();
    const path = normalizePath(request.path);
    const route = routeConfig(method, path);

    if (!route) {
      return jsonError(404, {
        code: "INVALID_INPUT",
        message: `No engine route for ${method} ${path}`,
      });
    }

    if (
      route.internal &&
      !isAuthorizedInternalRequest(request, options, now().getTime())
    ) {
      return jsonError(401, {
        code: "UNAUTHORIZED",
        message: "Internal endpoint requires a valid signed service request",
      });
    }

    const rateLimit = checkRateLimit({
      limits: rateLimits,
      scope: route.rateLimitScope,
      route: `${method} ${path}`,
      subject: requestSubject(request),
      nowMs: now().getTime(),
      max:
        route.rateLimitScope === "internal"
          ? (options.internalLimit ?? 30)
          : (options.publicLimit ?? 90),
      windowMs: 60_000,
    });

    if (!rateLimit.allowed) {
      return {
        ...jsonError(429, {
          code: "RATE_LIMITED",
          message: "Rate limit exceeded",
        }),
        headers: {
          ...jsonHeaders(),
          "retry-after": String(Math.ceil(rateLimit.retryAfterMs / 1000)),
        },
      };
    }

    const cacheKey = route.cacheTtlMs
      ? hashStable({ method, path, body: request.body })
      : null;
    if (cacheKey) {
      const cached = cache.get(cacheKey);
      if (cached && cached.expiresAt > now().getTime()) {
        return {
          ...cached.response,
          headers: {
            ...cached.response.headers,
            "x-powerrr-cache": "hit",
          },
        };
      }
    }

    const response = await dispatchRoute(engine, method, path, request.body);

    if (
      cacheKey &&
      response.statusCode >= 200 &&
      response.statusCode < 300 &&
      route.cacheTtlMs
    ) {
      cache.set(cacheKey, {
        expiresAt: now().getTime() + route.cacheTtlMs,
        response: {
          ...response,
          headers: {
            ...response.headers,
            "x-powerrr-cache": "miss",
          },
        },
      });
    }

    return response;
  };
}

async function dispatchRoute(
  engine: PowerrrEngine,
  method: string,
  path: string,
  body: unknown,
): Promise<EngineHttpResponse> {
  try {
    if (method === "GET" && path === "/v1/healthz") {
      return jsonOk(await engine.health());
    }

    if (method === "GET" && path === "/v1/version") {
      return jsonOk(await engine.version());
    }

    if (method === "GET" && path === "/v1/protocols") {
      return jsonOk(await engine.protocols());
    }

    if (
      method === "GET" &&
      (path === "/v2/protocols" || path === "/v2/policies/current")
    ) {
      return path === "/v2/protocols"
        ? jsonOk(await engine.protocols())
        : jsonOk(await engine.riskPolicy());
    }

    if (method === "GET" && path.startsWith("/v2/policies/")) {
      return jsonOk(
        await engine.riskPolicy(
          decodeURIComponent(path.slice("/v2/policies/".length)),
        ),
      );
    }

    if (method === "POST" && path === "/v1/resolve") {
      return jsonOk(await engine.resolve(body as never));
    }

    if (method === "POST" && path === "/v1/portfolio") {
      return jsonOk(await engine.portfolio(body as never));
    }

    if (method === "POST" && path === "/v1/quotes") {
      return jsonOk(await engine.quotes(body as never));
    }

    if (method === "POST" && path === "/v2/quotes") {
      return jsonOk(await engine.quotes(body as never));
    }

    if (method === "POST" && path === "/v2/internal/assessments") {
      return jsonOk(await engine.assessBorrowerRisk(body as never));
    }

    if (method === "POST" && path === "/v2/internal/scenarios") {
      return jsonOk(await engine.borrowerRiskScenarios(body as never));
    }

    if (method === "POST" && path === "/v1/internal/simulations") {
      return jsonOk(await engine.simulations(body as never));
    }

    return jsonError(404, {
      code: "INVALID_INPUT",
      message: `No engine route for ${method} ${path}`,
    });
  } catch (error) {
    const engineError = toPowerrrEngineError(error);
    return jsonError(engineError.statusCode, engineError.toApiError());
  }
}

function routeConfig(method: string, path: string): RouteConfig | null {
  if (method === "GET" && path === "/v1/healthz") {
    return { cacheTtlMs: 1_000, rateLimitScope: "public" };
  }

  if (method === "GET" && path === "/v1/version") {
    return { cacheTtlMs: 10_000, rateLimitScope: "public" };
  }

  if (method === "GET" && path === "/v1/protocols") {
    return { cacheTtlMs: 300_000, rateLimitScope: "public" };
  }

  if (
    method === "GET" &&
    (path === "/v2/protocols" || path.startsWith("/v2/policies/"))
  ) {
    return { cacheTtlMs: 300_000, rateLimitScope: "public" };
  }

  if (method === "POST" && path === "/v1/resolve") {
    return { cacheTtlMs: 600_000, rateLimitScope: "public" };
  }

  if (method === "POST" && path === "/v1/portfolio") {
    return { cacheTtlMs: 15_000, rateLimitScope: "public" };
  }

  if (method === "POST" && path === "/v1/quotes") {
    return { cacheTtlMs: 15_000, rateLimitScope: "public" };
  }

  if (method === "POST" && path === "/v2/quotes") {
    return { cacheTtlMs: 15_000, rateLimitScope: "public" };
  }

  if (
    method === "POST" &&
    (path === "/v2/internal/assessments" || path === "/v2/internal/scenarios")
  ) {
    return { internal: true, rateLimitScope: "internal" };
  }

  if (method === "POST" && path === "/v1/internal/simulations") {
    return { internal: true, rateLimitScope: "internal" };
  }

  return null;
}

function isAuthorizedInternalRequest(
  request: EngineHttpRequest,
  options: EngineHttpHandlerOptions,
  nowMs: number,
): boolean {
  const headers = normalizeHeaders(request.headers ?? {});
  const expectedToken =
    options.internalToken ?? process.env.POWERRR_INTERNAL_API_TOKEN ?? "";
  const providedToken = headers["x-powerrr-internal-token"];

  if (
    expectedToken &&
    providedToken &&
    secureEqual(providedToken, expectedToken)
  ) {
    return true;
  }

  const localFallbackAllowed =
    options.allowLocalInternalToken ?? process.env.NODE_ENV !== "production";
  if (
    localFallbackAllowed &&
    !expectedToken &&
    providedToken === DEFAULT_LOCAL_INTERNAL_TOKEN
  ) {
    return true;
  }

  const secret =
    options.signingSecret ?? process.env.POWERRR_INTERNAL_SIGNING_SECRET ?? "";
  const timestamp = headers["x-powerrr-internal-timestamp"];
  const signature = headers["x-powerrr-internal-signature"];

  if (!secret || !timestamp || !signature) {
    return false;
  }

  const ageMs = Math.abs(nowMs - Number(timestamp));
  if (!Number.isFinite(ageMs) || ageMs > 5 * 60_000) {
    return false;
  }

  const canonicalBody = canonicalJson(request.body ?? {});
  const payload = [
    request.method.toUpperCase(),
    normalizePath(request.path),
    timestamp,
    createHash("sha256").update(canonicalBody).digest("hex"),
  ].join("\n");
  const expected = createHmac("sha256", secret).update(payload).digest("hex");

  return secureEqual(signature, expected);
}

function checkRateLimit(input: {
  limits: Map<string, RateEntry>;
  scope: string;
  route: string;
  subject: string;
  nowMs: number;
  max: number;
  windowMs: number;
}): { allowed: true } | { allowed: false; retryAfterMs: number } {
  const key = hashStable({
    scope: input.scope,
    route: input.route,
    subject: input.subject,
  });
  const current = input.limits.get(key);

  if (!current || current.resetAt <= input.nowMs) {
    input.limits.set(key, {
      count: 1,
      resetAt: input.nowMs + input.windowMs,
    });
    return { allowed: true };
  }

  if (current.count >= input.max) {
    return {
      allowed: false,
      retryAfterMs: current.resetAt - input.nowMs,
    };
  }

  current.count += 1;
  return { allowed: true };
}

function requestSubject(request: EngineHttpRequest): string {
  const body = isRecord(request.body) ? request.body : {};
  const input = isRecord(body.input) ? body.input : {};
  const rawSubject = [
    request.remoteAddress ?? "unknown",
    stringValue(input.address),
    stringValue(input.ensName),
  ]
    .filter(Boolean)
    .join(":");

  return hashStable(rawSubject);
}

function normalizePath(path: string): string {
  const normalized = path.split("?")[0]?.replace(/\/+$/, "") || "/";
  return normalized === "" ? "/" : normalized;
}

function normalizeHeaders(headers: HeaderBag): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      normalized[key.toLowerCase()] = value.join(",");
    } else if (value !== undefined) {
      normalized[key.toLowerCase()] = value;
    }
  }
  return normalized;
}

function jsonOk(body: unknown): EngineHttpResponse {
  return {
    statusCode: 200,
    headers: jsonHeaders(),
    body,
  };
}

function jsonError(statusCode: number, error: ApiError): EngineHttpResponse {
  return {
    statusCode,
    headers: jsonHeaders(),
    body: { error },
  };
}

function jsonHeaders(): Record<string, string> {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }

  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
    )
    .join(",")}}`;
}

function hashStable(value: unknown): string {
  return createHash("sha256")
    .update(typeof value === "string" ? value : canonicalJson(value))
    .digest("hex");
}

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
