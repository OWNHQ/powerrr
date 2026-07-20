export default defineEventHandler(async (event) => {
  try {
    await enforcePublicRateLimit(event, undefined, "v2-policy");
    const version = getRouterParam(event, "version");
    return await usePowerrrEngine().riskPolicy(
      version === "current" ? undefined : version,
    );
  } catch (error) {
    return handleApiError(event, error);
  }
});
