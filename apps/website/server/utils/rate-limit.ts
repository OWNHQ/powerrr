import { createError, getHeader, type H3Event } from "h3";
import { hashedCacheKey } from "./cache-core.js";
import {
  createMemoryRateLimiter,
  type RateLimitDecision,
  type RateLimitOptions,
} from "./rate-limit-core.js";
import { checkDistributedRateLimit } from "./distributed-state.js";

const publicLimiter = createMemoryRateLimiter();
const internalLimiter = createMemoryRateLimiter();

export function enforcePublicRateLimit(
  event: H3Event,
  subject: string | undefined,
  scope: string,
): Promise<void> {
  return enforceRateLimit(event, publicLimiter, {
    scope: `public:${scope}`,
    subject: hashedCacheKey("rate-limit-subject", {
      client: clientKey(event),
      subject: subject ?? "none",
    }),
    limit: 60,
    windowMs: 60_000,
  });
}

export function enforceOwnLeadRateLimit(event: H3Event): Promise<void> {
  return enforceRateLimit(event, publicLimiter, {
    scope: "public:own-leads",
    subject: clientKey(event),
    limit: 10,
    windowMs: 60_000,
  });
}

export function enforceInternalRateLimit(
  event: H3Event,
  scope: string,
): Promise<void> {
  return enforceRateLimit(event, internalLimiter, {
    scope: `internal:${scope}`,
    subject: clientKey(event),
    limit: 20,
    windowMs: 60_000,
  });
}

async function enforceRateLimit(
  event: H3Event,
  limiter: ReturnType<typeof createMemoryRateLimiter>,
  options: RateLimitOptions,
): Promise<void> {
  let decision: RateLimitDecision;
  try {
    decision =
      (await checkDistributedRateLimit(options)) ?? limiter.check(options);
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "distributed-state.failed",
        operation: "rate-limit",
        errorCategory: error instanceof Error ? error.name : "unknown",
      }),
    );
    if (process.env.POWERRR_RUNTIME_TIER === "production") {
      throw createError({
        statusCode: 503,
        statusMessage: "Request controls are temporarily unavailable",
        data: {
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "The service is temporarily unavailable. Try again soon.",
          },
        },
      });
    }
    decision = limiter.check(options);
  }
  event.node.res.setHeader("x-ratelimit-limit", String(options.limit));
  event.node.res.setHeader("x-ratelimit-remaining", String(decision.remaining));
  event.node.res.setHeader(
    "x-ratelimit-reset",
    new Date(decision.resetAt).toISOString(),
  );

  if (!decision.allowed) {
    throw createError({
      statusCode: 429,
      statusMessage: "Rate limit exceeded",
      data: {
        error: {
          code: "RATE_LIMITED",
          message:
            "Too many requests. Try again after the rate limit window resets.",
        },
      },
    });
  }
}

function clientKey(event: H3Event): string {
  const socketIp = event.node.req.socket.remoteAddress;
  const trustedPlatformProxy =
    process.env.VERCEL === "1" || process.env.POWERRR_TRUST_PROXY === "true";
  if (!trustedPlatformProxy) {
    return socketIp ?? "unknown";
  }

  const forwardedFor = getHeader(event, "x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const realIp = getHeader(event, "x-real-ip");

  return forwardedFor ?? realIp ?? socketIp ?? "unknown";
}
