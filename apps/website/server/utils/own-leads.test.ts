import type { OwnLeadRequest } from "@powerrr/shared-types";
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  deliverOwnLead,
  ownLeadStatus,
  type OwnLeadDeliveryConfig,
} from "./own-leads.js";

const request: OwnLeadRequest = {
  idempotencyKey: "d58e9be4-3f95-4ee4-858e-1e4f7a5d89a9",
  email: "borrower@example.com",
  wallet: "powerrr.eth",
  requestedAmountUsd: 50_000,
  creditAsset: "USDC",
  termMonths: 24,
  collateral: [{ symbol: "WETH", valueUsd: 100_000 }],
  policyVersion: "own-collateral-v1",
  consent: true,
};

const configured: OwnLeadDeliveryConfig = {
  webhookUrl: "https://own.example/hooks/leads",
  webhookSecret: "test-secret",
  timeoutMs: 1_000,
  developmentMock: false,
  production: true,
};

describe("OWN lead delivery", () => {
  it("disables production submission when webhook configuration is incomplete", () => {
    expect(ownLeadStatus({ ...configured, webhookSecret: "" })).toEqual({
      enabled: false,
      reason:
        "OWN offer requests are temporarily unavailable. Please try again later.",
    });
  });

  it("signs the exact payload and forwards the idempotency key", async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const body = String(init.body);
      const headers = init.headers as Record<string, string>;
      const expected = createHmac("sha256", configured.webhookSecret)
        .update(body)
        .digest("hex");

      expect(headers["x-powerrr-signature"]).toBe(`sha256=${expected}`);
      expect(headers["x-powerrr-idempotency-key"]).toBe(request.idempotencyKey);
      expect(JSON.parse(body).lead.email).toBe(request.email);
      return { ok: true, status: 202 };
    });

    const response = await deliverOwnLead(request, configured, fetcher);
    expect(response.delivery).toBe("webhook");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("supports development-only delivery without sending PII anywhere", async () => {
    const fetcher = vi.fn();
    const response = await deliverOwnLead(
      request,
      {
        ...configured,
        production: false,
        developmentMock: true,
        webhookUrl: "",
        webhookSecret: "",
      },
      fetcher,
    );

    expect(response.delivery).toBe("development-mock");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails closed on delivery timeout without logging lead details", async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      return await new Promise<never>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    const delivery = deliverOwnLead(
      request,
      { ...configured, timeoutMs: 250 },
      fetcher,
    );
    const rejection = expect(delivery).rejects.toMatchObject({
      message: "OWN offer request timed out",
      statusCode: 504,
    });
    await vi.advanceTimersByTimeAsync(250);
    await rejection;
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();

    log.mockRestore();
    warn.mockRestore();
    errorLog.mockRestore();
    vi.useRealTimers();
  });
});
