import type { SimulationRequest } from "@powerrr/shared-types";

export default defineEventHandler(async (event) => {
  try {
    await enforceInternalRateLimit(event, "simulations");
    const body = await readBody<SimulationRequest>(event);
    requireInternalAuth(event, body);
    return await usePowerrrEngine().simulations(body);
  } catch (error) {
    return handleApiError(event, error);
  }
});
