import { OwnLeadRequestSchema } from "@powerrr/schemas";
import type { OwnLeadResponse } from "@powerrr/shared-types";
import { createError } from "h3";

export default defineEventHandler(async (event): Promise<OwnLeadResponse> => {
  const raw = await readBody(event);
  const parsed = OwnLeadRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "OWN offer request validation failed",
      data: {
        error: {
          code: "INVALID_INPUT",
          message: "Check the offer request fields and try again.",
        },
      },
    });
  }

  await enforceOwnLeadRateLimit(event);
  if (parsed.data.website) {
    return {
      accepted: true,
      requestId: parsed.data.idempotencyKey,
      delivery: "honeypot",
    };
  }

  try {
    const config = useRuntimeConfig();
    return await deliverOwnLead(
      parsed.data,
      ownLeadDeliveryConfig(config as unknown as Record<string, unknown>),
    );
  } catch (error) {
    if (error instanceof OwnLeadDeliveryError) {
      throw createError({
        statusCode: error.statusCode,
        statusMessage: error.message,
        data: {
          error: {
            code: "INTERNAL_ERROR",
            message: error.message,
          },
        },
      });
    }
    throw error;
  }
});
