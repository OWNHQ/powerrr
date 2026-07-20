export default defineEventHandler(async (event) => {
  try {
    return {
      ...(await usePowerrrEngine().version()),
      sourceReadiness: useSourceReadiness(),
      sourceClientDiagnostics: useSourceClientDiagnostics(),
    };
  } catch (error) {
    return handleApiError(event, error);
  }
});
