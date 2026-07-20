import type { ResolveRequest } from "@powerrr/shared-types";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<ResolveRequest>(event);
    await enforcePublicRateLimit(
      event,
      addressInputRateLimitSubject(body),
      "resolve",
    );
    return await cachedResponse(
      event,
      {
        scope: "resolve",
        ttlMs: 20 * 60_000,
        subject: body,
      },
      () => usePowerrrEngine().resolve(body),
    );
  } catch (error) {
    return handleApiError(event, error);
  }
});
