import type { BorrowerRiskAssessmentRequest } from "@powerrr/shared-types";

export default defineEventHandler(async (event) => {
  try {
    await enforceInternalRateLimit(event, "v2-assessments");
    const body = await readBody<BorrowerRiskAssessmentRequest>(event);
    requireInternalAuth(event, body);
    return await usePowerrrEngine().assessBorrowerRisk(body);
  } catch (error) {
    return handleApiError(event, error);
  }
});
