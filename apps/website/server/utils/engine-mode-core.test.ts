import { PowerrrEngineError } from "@powerrr/engine-sdk";
import { describe, expect, it } from "vitest";
import { resolveEngineDataMode } from "./engine-mode-core.js";

describe("Nuxt engine data mode configuration", () => {
  it("defaults to fixture mode for local runtime values", () => {
    expect(resolveEngineDataMode(undefined)).toBe("fixtures");
    expect(resolveEngineDataMode("")).toBe("fixtures");
    expect(resolveEngineDataMode("fixtures")).toBe("fixtures");
  });

  it("fails explicitly when live mode has no configured exact protocol source", () => {
    expect(() => resolveEngineDataMode("live")).toThrow(PowerrrEngineError);

    try {
      resolveEngineDataMode("live", {
        liveReady: false,
        missingRequiredEnvKeys: ["ETHEREUM_RPC_URL"],
        protocols: [],
      });
    } catch (error) {
      expect(error).toBeInstanceOf(PowerrrEngineError);
      expect((error as PowerrrEngineError).code).toBe(
        "PROTOCOL_SOURCE_UNAVAILABLE",
      );
      expect((error as PowerrrEngineError).statusCode).toBe(503);
      expect((error as PowerrrEngineError).toApiError()).toMatchObject({
        code: "PROTOCOL_SOURCE_UNAVAILABLE",
        message: expect.stringContaining(
          "requires at least one configured protocol-native exact quote source",
        ),
        details: {
          missingRequiredEnvKeys: ["ETHEREUM_RPC_URL"],
        },
      });
      return;
    }

    throw new Error("Expected missing live source configuration to fail");
  });

  it("enables live mode when at least one exact protocol source is configured", () => {
    expect(
      resolveEngineDataMode("live", {
        liveReady: false,
        missingRequiredEnvKeys: ["AAVE_V3_GRAPHQL_URL"],
        protocols: [
          {
            protocolId: "compound-iii",
            implemented: true,
            exactQuoteReady: true,
            missingRequiredEnvKeys: [],
            sources: [],
          },
          {
            protocolId: "aave-v3",
            implemented: true,
            exactQuoteReady: false,
            missingRequiredEnvKeys: ["AAVE_V3_GRAPHQL_URL"],
            sources: [],
          },
        ],
      }),
    ).toBe("live");
  });

  it("fails closed for unknown data modes", () => {
    try {
      resolveEngineDataMode("production");
    } catch (error) {
      expect(error).toBeInstanceOf(PowerrrEngineError);
      expect((error as PowerrrEngineError).code).toBe("INTERNAL_ERROR");
      expect((error as PowerrrEngineError).statusCode).toBe(500);
      return;
    }

    throw new Error("Expected unknown data mode to fail");
  });
});
