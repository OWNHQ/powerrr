export default defineEventHandler(async (event) => {
  try {
    const health = await usePowerrrEngine().health();
    const config = useRuntimeConfig();
    const runtimeTier =
      health.dataMode === "live"
        ? String(config.powerrrRuntimeTier) === "production"
          ? "production"
          : "public-rpc-preview"
        : "fixture";
    const runtimeConfiguration = useRuntimeConfigurationReadiness();
    return {
      ...health,
      runtimeTier,
      availabilityGuarantee:
        runtimeTier === "production" &&
        runtimeConfiguration.productionPrerequisitesSatisfied
          ? "configured"
          : "none",
      checkedAt: new Date().toISOString(),
      buildSha:
        process.env.VERCEL_GIT_COMMIT_SHA ??
        process.env.GIT_COMMIT_SHA ??
        "unknown",
      schemaVersion: "2026-07-20",
      configurationReadiness: useSourceReadiness(),
      sourceClientDiagnostics: useSourceClientDiagnostics(),
      lastSourceReads: sourceReadHealthSnapshot(),
      runtimeConfiguration,
    };
  } catch (error) {
    return handleApiError(event, error);
  }
});
