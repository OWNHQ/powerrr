import { distributedStateStatus } from "./distributed-state.js";

export type RuntimeConfigurationReadiness = {
  runtimeTier: "fixture" | "public-rpc-preview" | "production";
  primaryRpcConfigured: boolean;
  primaryRpcAuthenticated: boolean;
  secondaryRpcConfigured: boolean;
  distributedControlsConfigured: boolean;
  productionPrerequisitesSatisfied: boolean;
  blockers: string[];
};

export function useRuntimeConfigurationReadiness(): RuntimeConfigurationReadiness {
  const config = useRuntimeConfig();
  const dataMode =
    String(config.powerrrDataMode) === "live" ? "live" : "fixtures";
  const runtimeTier =
    dataMode === "fixtures"
      ? "fixture"
      : String(config.powerrrRuntimeTier) === "production"
        ? "production"
        : "public-rpc-preview";
  const primaryRpcConfigured = hasValue(config.ethereumRpcUrl);
  const primaryRpcAuthenticated = booleanValue(config.powerrrRpcAuthenticated);
  const secondaryRpcConfigured = hasValue(config.alchemyApiKey);
  const distributedControlsConfigured = distributedStateStatus().configured;
  const blockers: string[] = [];

  if (!primaryRpcConfigured) blockers.push("primary-rpc-missing");
  if (!primaryRpcAuthenticated) blockers.push("primary-rpc-not-attested");
  if (!secondaryRpcConfigured) blockers.push("secondary-rpc-missing");
  if (!distributedControlsConfigured) {
    blockers.push("distributed-controls-missing");
  }

  return {
    runtimeTier,
    primaryRpcConfigured,
    primaryRpcAuthenticated,
    secondaryRpcConfigured,
    distributedControlsConfigured,
    productionPrerequisitesSatisfied: blockers.length === 0,
    blockers,
  };
}

function hasValue(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function booleanValue(value: unknown): boolean {
  return value === true || String(value).toLowerCase() === "true";
}
