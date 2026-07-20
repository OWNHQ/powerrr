export default defineEventHandler(async (event) => {
  try {
    await enforcePublicRateLimit(event, undefined, "protocols");
    return await cachedResponse(
      event,
      {
        scope: "protocols",
        ttlMs: 10 * 60_000,
        subject: "all",
      },
      () => usePowerrrEngine().protocols(),
    );
  } catch (error) {
    return handleApiError(event, error);
  }
});
