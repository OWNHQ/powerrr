import { runBorrowerRiskScenarios } from "@powerrr/own-underwriter";
import { BorrowerRiskScenarioRequestSchema } from "@powerrr/schemas";
import type { BorrowerRiskScenarioRequest } from "@powerrr/shared-types";
import { createError, readBody } from "h3";

export default defineEventHandler(async (event) => {
  try {
    const payload = await readBody(event);
    const request = BorrowerRiskScenarioRequestSchema.parse(
      payload,
    ) as BorrowerRiskScenarioRequest;
    return runBorrowerRiskScenarios(request);
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage:
        error instanceof Error
          ? error.message
          : "Invalid borrower risk scenario request",
    });
  }
});
