import {
  createLiveSourceClients,
  type LiveSourceClients,
  type SourceClientDiagnostic,
  type SourceReadinessReport,
} from "@powerrr/clients";

let cachedClients: LiveSourceClients | undefined;
let cachedKey = "";

export function useSourceReadiness(): SourceReadinessReport {
  return useLiveSourceClients().readiness;
}

export function useSourceClientDiagnostics(): SourceClientDiagnostic[] {
  return useLiveSourceClients().diagnostics;
}

export function useLiveSourceClients(): LiveSourceClients {
  const config = useRuntimeConfig();
  const clientConfig = {
    ETHEREUM_RPC_URL: stringValue(config.ethereumRpcUrl),
    AAVE_V3_GRAPHQL_URL: stringValue(config.aaveV3GraphqlUrl),
    AAVE_V4_GRAPHQL_URL: stringValue(config.aaveV4GraphqlUrl),
    MORPHO_GRAPHQL_URL: stringValue(config.morphoGraphqlUrl),
    EULER_DATA_URL: stringValue(config.eulerDataUrl),
    SPARK_DATA_URL: stringValue(config.sparkDataUrl),
    ALCHEMY_API_KEY: stringValue(config.alchemyApiKey),
  };
  const timeoutMs = numberValue(config.sourceClientTimeoutMs) ?? 2_500;
  const key = JSON.stringify({ clientConfig, timeoutMs });
  if (cachedClients && cachedKey === key) {
    return cachedClients;
  }

  cachedKey = key;
  cachedClients = createLiveSourceClients(clientConfig, { timeoutMs });
  return cachedClients;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  return undefined;
}
