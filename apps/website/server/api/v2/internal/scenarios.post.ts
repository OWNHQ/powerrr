import type { BorrowerRiskScenarioRequest } from "@powerrr/shared-types";

export default defineEventHandler(async (event) => {
  try {
    await enforceInternalRateLimit(event, "v2-borrower-scenarios");
    const body = await readBody<BorrowerRiskScenarioRequest>(event);
    requireInternalAuth(event, body);
    return await usePowerrrEngine().borrowerRiskScenarios(body);
  } catch (error) {
    return handleApiError(event, error);
  }
});
