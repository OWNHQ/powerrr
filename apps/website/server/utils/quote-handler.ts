import type { QuoteRequest } from "@powerrr/shared-types";
import { getHeader, setHeader, type H3Event } from "h3";
import { hashedCacheKey } from "./cache-core.js";

export async function handleQuoteRequest(
  event: H3Event,
  options: { deprecated?: boolean } = {},
) {
  const startedAt = Date.now();
  try {
    if (options.deprecated) {
      setHeader(event, "deprecation", "true");
      setHeader(event, "link", '</api/v2/quotes>; rel="successor-version"');
      setHeader(event, "sunset", "Thu, 31 Dec 2026 23:59:59 GMT");
    }

    const body = await readBody<QuoteRequest>(event);
    const refreshRequested =
      getHeader(event, "x-powerrr-refresh") === "1" ||
      (getHeader(event, "cache-control") ?? "")
        .toLowerCase()
        .split(",")
        .some((directive) => directive.trim() === "no-cache");
    const subject = addressInputRateLimitSubject(body);
    await enforcePublicRateLimit(event, subject, "quotes");
    const response = await cachedResponse(
      event,
      {
        scope: "quotes-v2",
        ttlMs: 15_000,
        subject: body,
        bypassRead: refreshRequested,
      },
      () => usePowerrrEngine().quotes(body),
    );
    console.info(
      JSON.stringify({
        event: "quote.completed",
        requestId: response.requestId,
        walletHash: subject
          ? hashedCacheKey("wallet-log", subject).slice(0, 16)
          : "anonymous",
        durationMs: Date.now() - startedAt,
        blockNumber: response.blockNumber,
        cacheStatus: response.cache.status,
        completeness: response.completeness,
        providers: response.protocolAvailability.map((provider) => ({
          id: provider.protocolId,
          status: provider.status,
          code: provider.code,
        })),
      }),
    );
    return response;
  } catch (error) {
    const handled = handleApiError(event, error);
    console.error(
      JSON.stringify({
        event: "quote.failed",
        requestId: handled.error.requestId,
        durationMs: Date.now() - startedAt,
        errorCategory: error instanceof Error ? error.name : "unknown",
      }),
    );
    return handled;
  }
}
