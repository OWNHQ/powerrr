import { describe, expect, it } from "vitest";
import {
  DEFAULT_INTERNAL_API_TOKEN,
  DEFAULT_INTERNAL_SIGNING_SECRET,
  isLocalInternalTokenFallback,
  isValidInternalSignature,
  isValidInternalToken,
  signInternalRequest,
} from "./internal-auth-core.js";

describe("internal API auth", () => {
  it("requires an exact service token match", () => {
    expect(
      isValidInternalToken(
        DEFAULT_INTERNAL_API_TOKEN,
        DEFAULT_INTERNAL_API_TOKEN,
      ),
    ).toBe(true);
    expect(isValidInternalToken("wrong", DEFAULT_INTERNAL_API_TOKEN)).toBe(
      false,
    );
    expect(isValidInternalToken(undefined, DEFAULT_INTERNAL_API_TOKEN)).toBe(
      false,
    );
    expect(
      isValidInternalToken(
        [DEFAULT_INTERNAL_API_TOKEN],
        DEFAULT_INTERNAL_API_TOKEN,
      ),
    ).toBe(false);
    expect(isValidInternalToken(DEFAULT_INTERNAL_API_TOKEN, undefined)).toBe(
      false,
    );
  });

  it("allows token fallback only for the local default token", () => {
    expect(
      isLocalInternalTokenFallback(
        DEFAULT_INTERNAL_API_TOKEN,
        DEFAULT_INTERNAL_API_TOKEN,
      ),
    ).toBe(true);
    expect(
      isLocalInternalTokenFallback("production-secret", "production-secret"),
    ).toBe(false);
  });

  it("signs method, path, timestamp, and canonical request body", () => {
    const body = {
      chainId: 1,
      input: {
        ensName: "powerrr.eth",
      },
      requestedPrincipalUsd: 50_000,
    };
    const timestampMs = "1782900000000";
    const signature = signInternalRequest({
      method: "post",
      path: "/api/v2/internal/assessments?ignored=true",
      timestampMs,
      body,
      secret: DEFAULT_INTERNAL_SIGNING_SECRET,
    });

    expect(signature).toMatch(/^[a-f0-9]{64}$/);
    expect(
      isValidInternalSignature({
        method: "POST",
        path: "/api/v2/internal/assessments",
        timestampMs,
        body: {
          requestedPrincipalUsd: 50_000,
          input: {
            ensName: "powerrr.eth",
          },
          chainId: 1,
        },
        secret: DEFAULT_INTERNAL_SIGNING_SECRET,
        provided: signature,
        nowMs: Number(timestampMs),
      }),
    ).toBe(true);
  });

  it("rejects stale or mismatched signatures", () => {
    const timestampMs = "1782900000000";
    const signature = signInternalRequest({
      method: "POST",
      path: "/api/v2/internal/assessments",
      timestampMs,
      body: { chainId: 1 },
      secret: DEFAULT_INTERNAL_SIGNING_SECRET,
    });

    expect(
      isValidInternalSignature({
        method: "POST",
        path: "/api/v2/internal/assessments",
        timestampMs,
        body: { chainId: 2 },
        secret: DEFAULT_INTERNAL_SIGNING_SECRET,
        provided: signature,
        nowMs: Number(timestampMs),
      }),
    ).toBe(false);
    expect(
      isValidInternalSignature({
        method: "POST",
        path: "/api/v2/internal/assessments",
        timestampMs,
        body: { chainId: 1 },
        secret: DEFAULT_INTERNAL_SIGNING_SECRET,
        provided: signature,
        nowMs: Number(timestampMs) + 10 * 60_000,
      }),
    ).toBe(false);
  });
});
