import { describe, expect, it, vi } from "vitest";
import {
  createCircuitBreaker,
  createLiveSourceClients,
  evaluateSourceReadiness,
  FallbackJsonRpcClient,
  GraphQlClient,
  JsonRpcClient,
  policyForProtocol,
  UpstreamSourceError,
} from "./index.js";

describe("source clients", () => {
  it("defines official/on-chain priority for protocol adapters", () => {
    expect(policyForProtocol("aave-v3")?.priority[0]?.source).toBe(
      "official-api",
    );
    expect(policyForProtocol("compound-iii")?.priority[0]?.source).toBe(
      "on-chain",
    );
    expect(policyForProtocol("portfolio")?.priority.at(-1)?.source).toBe(
      "on-chain",
    );
  });

  it("evaluates required live source configuration without exposing secret values", () => {
    const missing = evaluateSourceReadiness({});

    expect(missing.liveReady).toBe(false);
    expect(missing.missingRequiredEnvKeys).toContain("ETHEREUM_RPC_URL");
    expect(
      missing.protocols.find((protocol) => protocol.protocolId === "aave-v4")
        ?.implemented,
    ).toBe(false);
    expect(
      missing.protocols.find((protocol) => protocol.protocolId === "portfolio")
        ?.exactQuoteReady,
    ).toBe(false);
    expect(JSON.stringify(missing)).not.toContain("https://");

    const configured = evaluateSourceReadiness({
      ETHEREUM_RPC_URL: "https://rpc.example.test",
      AAVE_V3_GRAPHQL_URL: "https://aave-v3.example.test/graphql",
      AAVE_V4_GRAPHQL_URL: "https://aave-v4.example.test/graphql",
      MORPHO_GRAPHQL_URL: "https://morpho.example.test/graphql",
    });

    expect(configured.liveReady).toBe(true);
    expect(configured.missingRequiredEnvKeys).toEqual([]);
    expect(
      configured.protocols.find((protocol) => protocol.protocolId === "aave-v3")
        ?.exactQuoteReady,
    ).toBe(true);
    expect(JSON.stringify(configured)).not.toContain("rpc.example.test");
  });

  it("constructs configured live source clients with redacted diagnostics", () => {
    const liveSources = createLiveSourceClients(
      {
        ETHEREUM_RPC_URL: "https://rpc.example.test",
        AAVE_V3_GRAPHQL_URL: "https://aave-v3.example.test/graphql",
        AAVE_V4_GRAPHQL_URL: "https://aave-v4.example.test/graphql",
        MORPHO_GRAPHQL_URL: "https://morpho.example.test/graphql",
        ALCHEMY_API_KEY: "alchemy-secret",
      },
      { timeoutMs: 1_250 },
    );

    expect(liveSources.readiness.liveReady).toBe(true);
    expect(liveSources.clients.ethereumRpc).toBeInstanceOf(
      FallbackJsonRpcClient,
    );
    expect(liveSources.clients.aaveV3GraphQl).toBeInstanceOf(GraphQlClient);
    expect(liveSources.clients.eulerData).toBeUndefined();
    expect(
      liveSources.diagnostics.find((item) => item.id === "ethereumRpc"),
    ).toMatchObject({
      envKey: "ETHEREUM_RPC_URL",
      configured: true,
      clientType: "json-rpc",
      timeoutMs: 1_250,
    });

    const serialized = JSON.stringify(liveSources);
    expect(serialized).not.toContain("rpc.example.test");
    expect(serialized).not.toContain("alchemy-secret");
    expect(serialized).toContain('"configured":true');
  });

  it("wraps GraphQL requests and returns typed data", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({ data: { markets: [{ id: "1" }] } }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });
    const client = new GraphQlClient({
      baseUrl: "https://example.test/graphql",
      timeoutMs: 1_000,
      fetchImpl,
    });

    const data = await client.request<{ markets: Array<{ id: string }> }>({
      query: "query Markets { markets { id } }",
    });

    expect(data.markets[0]?.id).toBe("1");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("wraps JSON-RPC requests and surfaces result values", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x16" }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });
    const client = new JsonRpcClient({
      baseUrl: "https://rpc.example.test",
      timeoutMs: 1_000,
      fetchImpl,
    });

    await expect(
      client.request<string>({ method: "eth_blockNumber" }),
    ).resolves.toBe("0x16");
  });

  it("batches JSON-RPC reads and retries one retryable failure", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("temporary", { status: 503 }))
      .mockImplementationOnce(async (_url, init) => {
        const payload = JSON.parse(String(init?.body)) as Array<{ id: number }>;
        return new Response(
          JSON.stringify(
            payload.map((item, index) => ({
              jsonrpc: "2.0",
              id: item.id,
              result: index === 0 ? "0x10" : "0x20",
            })),
          ),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      });
    const client = new JsonRpcClient({
      baseUrl: "https://rpc.example.test",
      timeoutMs: 1_000,
      fetchImpl,
    });

    await expect(
      client.batch<string>([
        { method: "eth_getBalance", params: ["0x1", "latest"] },
        { method: "eth_call", params: [{ to: "0x2", data: "0x3" }, "latest"] },
      ]),
    ).resolves.toEqual(["0x10", "0x20"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("fails over retryable primary RPC failures to the secondary client", async () => {
    const primary = {
      toJSON: () => ({ type: "json-rpc" as const }),
      request: vi
        .fn()
        .mockRejectedValue(
          new UpstreamSourceError("primary", "unavailable", true),
        ),
      batch: vi
        .fn()
        .mockRejectedValue(
          new UpstreamSourceError("primary", "unavailable", true),
        ),
    };
    const secondary = {
      toJSON: () => ({ type: "json-rpc" as const }),
      request: vi.fn().mockResolvedValue("0x20"),
      batch: vi.fn().mockResolvedValue(["0x20"]),
    };
    const client = new FallbackJsonRpcClient(primary, secondary);

    await expect(client.request({ method: "eth_blockNumber" })).resolves.toBe(
      "0x20",
    );
    await expect(
      client.batch([{ method: "eth_blockNumber" }]),
    ).resolves.toEqual(["0x20"]);
    expect(secondary.request).toHaveBeenCalledOnce();
    expect(secondary.batch).toHaveBeenCalledOnce();
  });

  it("opens the circuit breaker after repeated failures", async () => {
    let currentTime = 1_000;
    const breaker = createCircuitBreaker({
      failureThreshold: 2,
      resetAfterMs: 1_000,
      now: () => currentTime,
    });
    const failure = async () => {
      throw new UpstreamSourceError("test", "failed", true);
    };

    await expect(breaker.run(failure)).rejects.toBeInstanceOf(
      UpstreamSourceError,
    );
    await expect(breaker.run(failure)).rejects.toBeInstanceOf(
      UpstreamSourceError,
    );
    expect(breaker.state()).toBe("open");
    await expect(breaker.run(async () => "ok")).rejects.toThrow(
      "Circuit breaker is open",
    );

    currentTime = 2_100;
    await expect(breaker.run(async () => "ok")).resolves.toBe("ok");
    expect(breaker.state()).toBe("closed");
  });
});
