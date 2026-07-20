export default defineEventHandler(async (event) => {
  try {
    await enforcePublicRateLimit(event, undefined, "v2-protocols");
    return await cachedResponse(
      event,
      { scope: "v2-protocols", ttlMs: 10 * 60_000, subject: "all" },
      () => usePowerrrEngine().protocols(),
    );
  } catch (error) {
    return handleApiError(event, error);
  }
});
