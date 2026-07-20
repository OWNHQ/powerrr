import type { PortfolioRequest } from "@powerrr/shared-types";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<PortfolioRequest>(event);
    await enforcePublicRateLimit(
      event,
      addressInputRateLimitSubject(body),
      "portfolio",
    );
    return await cachedResponse(
      event,
      {
        scope: "portfolio",
        ttlMs: 10_000,
        subject: body,
      },
      () => usePowerrrEngine().portfolio(body),
    );
  } catch (error) {
    return handleApiError(event, error);
  }
});
