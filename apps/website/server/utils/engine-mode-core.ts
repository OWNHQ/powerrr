import {
  PowerrrEngineError,
  type PowerrrEngineDataMode,
} from "@powerrr/engine-sdk";
import type { SourceReadinessReport } from "@powerrr/clients";

const SUPPORTED_DATA_MODES = ["fixtures", "live"] as const;

export function resolveEngineDataMode(
  value: unknown,
  sourceReadiness?: SourceReadinessReport,
): PowerrrEngineDataMode {
  if (value === undefined || value === null || value === "") {
    return "fixtures";
  }

  if (value === "fixtures") {
    return "fixtures";
  }

  if (value === "live") {
    const readyProtocolIds =
      sourceReadiness?.protocols
        .filter(
          (protocol) =>
            protocol.protocolId !== "portfolio" && protocol.exactQuoteReady,
        )
        .map((protocol) => protocol.protocolId) ?? [];

    if (readyProtocolIds.length === 0) {
      throw new PowerrrEngineError(
        "PROTOCOL_SOURCE_UNAVAILABLE",
        "POWERRR_DATA_MODE=live requires at least one configured protocol-native exact quote source",
        503,
        {
          supportedDataModes: SUPPORTED_DATA_MODES,
          requestedDataMode: "live",
          missingRequiredEnvKeys: sourceReadiness?.missingRequiredEnvKeys ?? [],
        },
      );
    }

    return "live";
  }

  throw new PowerrrEngineError(
    "INTERNAL_ERROR",
    "Unsupported POWERRR_DATA_MODE runtime configuration",
    500,
    {
      supportedDataModes: SUPPORTED_DATA_MODES,
      requestedDataMode: String(value),
    },
  );
}
