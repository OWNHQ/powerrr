import { assessBorrowerRisk } from "@powerrr/own-underwriter";
import { BorrowerRiskAssessmentRequestSchema } from "@powerrr/schemas";
import type { BorrowerRiskAssessmentRequest } from "@powerrr/shared-types";
import { createError, readBody } from "h3";

export default defineEventHandler(async (event) => {
  try {
    const payload = await readBody(event);
    const request = BorrowerRiskAssessmentRequestSchema.parse(
      payload,
    ) as BorrowerRiskAssessmentRequest;
    return assessBorrowerRisk(request);
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage:
        error instanceof Error
          ? error.message
          : "Invalid borrower risk assessment",
    });
  }
});
