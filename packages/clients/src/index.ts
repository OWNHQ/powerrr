import type { QuoteProvenance } from "@powerrr/shared-types";

export type SourcePriority =
  "official-api" | "on-chain" | "portfolio-discovery" | "fallback";

export type ProtocolSourcePolicy = {
  protocolId: string;
  priority: Array<{
    source: SourcePriority;
    label: string;
    envKey?: string;
    requiredForExactQuote: boolean;
  }>;
};

export type ProtocolSourceStatus = ProtocolSourcePolicy["priority"][number] & {
  configured: boolean;
};

export type ProtocolReadiness = {
  protocolId: string;
  implemented: boolean;
  exactQuoteReady: boolean;
  missingRequiredEnvKeys: string[];
  sources: ProtocolSourceStatus[];
};

const IMPLEMENTED_LIVE_PROTOCOLS = new Set([
  "aave-v3",
  "morpho-blue",
  "compound-iii",
  "sparklend",
  "portfolio",
]);

export type SourceReadinessReport = {
  liveReady: boolean;
  missingRequiredEnvKeys: string[];
  protocols: ProtocolReadiness[];
};

export type LiveSourceClientConfig = {
  ETHEREUM_RPC_URL?: string | null;
  AAVE_V3_GRAPHQL_URL?: string | null;
  AAVE_V4_GRAPHQL_URL?: string | null;
  MORPHO_GRAPHQL_URL?: string | null;
  EULER_DATA_URL?: string | null;
  SPARK_DATA_URL?: string | null;
  ALCHEMY_API_KEY?: string | null;
};

export type LiveSourceClientOptions = {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export type SourceClientId =
  | "ethereumRpc"
  | "aaveV3GraphQl"
  | "aaveV4GraphQl"
  | "morphoGraphQl"
  | "eulerData"
  | "sparkData"
  | "alchemyRpc";

export type SourceClientDiagnostic = {
  id: SourceClientId;
  envKey: keyof LiveSourceClientConfig;
  configured: boolean;
  clientType: "json-rpc" | "graphql" | "http-json";
  timeoutMs: number;
};

export type LiveSourceClients = {
  readiness: SourceReadinessReport;
  diagnostics: SourceClientDiagnostic[];
  clients: {
    ethereumRpc?: JsonRpcTransport;
    aaveV3GraphQl?: GraphQlClient;
    aaveV4GraphQl?: GraphQlClient;
    morphoGraphQl?: GraphQlClient;
    eulerData?: HttpJsonClient;
    sparkData?: HttpJsonClient;
    alchemyRpc?: JsonRpcClient;
  };
};

export type HttpClientOptions = {
  baseUrl: string;
  timeoutMs: number;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
};

export type GraphQlRequest = {
  query: string;
  variables?: Record<string, unknown>;
  operationName?: string;
};

export type JsonRpcRequest = {
  method: string;
  params?: unknown[];
};

export interface JsonRpcTransport {
  toJSON(): { type: "json-rpc" };
  request<TResult>(request: JsonRpcRequest): Promise<TResult>;
  batch<TResult>(requests: JsonRpcRequest[]): Promise<TResult[]>;
}

export class UpstreamSourceError extends Error {
  readonly source: string;
  readonly retryable: boolean;

  constructor(source: string, message: string, retryable: boolean) {
    super(message);
    this.name = "UpstreamSourceError";
    this.source = source;
    this.retryable = retryable;
  }
}

export class HttpJsonClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch;
  private readonly circuitBreaker = createCircuitBreaker({
    failureThreshold: 3,
    resetAfterMs: 30_000,
  });

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs;
    this.headers = options.headers ?? {};
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  toJSON(): { type: "http-json" } {
    return { type: "http-json" };
  }

  async post<TResponse>(path: string, body: unknown): Promise<TResponse> {
    return this.circuitBreaker.run(() => this.postOnce<TResponse>(path, body));
  }

  private async postOnce<TResponse>(
    path: string,
    body: unknown,
  ): Promise<TResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...this.headers,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new UpstreamSourceError(
          this.baseUrl,
          `Upstream responded with HTTP ${response.status}`,
          response.status >= 500 || response.status === 429,
        );
      }

      return (await response.json()) as TResponse;
    } catch (error) {
      if (error instanceof UpstreamSourceError) {
        throw error;
      }

      throw new UpstreamSourceError(
        this.baseUrl,
        error instanceof Error ? error.message : "Upstream request failed",
        true,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class GraphQlClient {
  private readonly http: HttpJsonClient;

  constructor(options: HttpClientOptions) {
    this.http = new HttpJsonClient(options);
  }

  toJSON(): { type: "graphql" } {
    return { type: "graphql" };
  }

  async request<TData>(request: GraphQlRequest): Promise<TData> {
    const response = await this.http.post<{
      data?: TData;
      errors?: Array<{ message: string }>;
    }>("", request);

    if (response.errors?.length) {
      throw new UpstreamSourceError(
        "graphql",
        response.errors.map((error) => error.message).join("; "),
        false,
      );
    }

    if (!response.data) {
      throw new UpstreamSourceError(
        "graphql",
        "GraphQL response did not include data",
        true,
      );
    }

    return response.data;
  }
}

export class JsonRpcClient implements JsonRpcTransport {
  private readonly http: HttpJsonClient;
  private nextId = 1;

  constructor(options: HttpClientOptions) {
    this.http = new HttpJsonClient(options);
  }

  toJSON(): { type: "json-rpc" } {
    return { type: "json-rpc" };
  }

  async request<TResult>(request: JsonRpcRequest): Promise<TResult> {
    return this.withOneRetry(async () => {
      const response = await this.http.post<{
        jsonrpc: "2.0";
        id: number;
        result?: TResult;
        error?: { code: number; message: string };
      }>("", {
        jsonrpc: "2.0",
        id: this.nextId++,
        method: request.method,
        params: request.params ?? [],
      });

      return resultFromRpcResponse(response);
    });
  }

  async batch<TResult>(requests: JsonRpcRequest[]): Promise<TResult[]> {
    if (requests.length === 0) {
      return [];
    }

    return this.withOneRetry(async () => {
      const payload = requests.map((request) => ({
        jsonrpc: "2.0" as const,
        id: this.nextId++,
        method: request.method,
        params: request.params ?? [],
      }));
      const responses = await this.http.post<
        Array<{
          jsonrpc: "2.0";
          id: number;
          result?: TResult;
          error?: { code: number; message: string };
        }>
      >("", payload);
      const byId = new Map(
        responses.map((response) => [response.id, response]),
      );

      return payload.map((request) => {
        const response = byId.get(request.id);
        if (!response) {
          throw new UpstreamSourceError(
            "json-rpc",
            `Batch response omitted id ${request.id}`,
            true,
          );
        }
        return resultFromRpcResponse(response);
      });
    });
  }

  private async withOneRetry<TResult>(
    operation: () => Promise<TResult>,
  ): Promise<TResult> {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof UpstreamSourceError) || !error.retryable) {
        throw error;
      }
      await delay(75 + Math.floor(Math.random() * 76));
      return operation();
    }
  }
}

export class FallbackJsonRpcClient implements JsonRpcTransport {
  constructor(
    private readonly primary: JsonRpcTransport,
    private readonly secondary: JsonRpcTransport,
  ) {}

  toJSON(): { type: "json-rpc" } {
    return { type: "json-rpc" };
  }

  async request<TResult>(request: JsonRpcRequest): Promise<TResult> {
    return this.withFallback((client) => client.request<TResult>(request));
  }

  async batch<TResult>(requests: JsonRpcRequest[]): Promise<TResult[]> {
    return this.withFallback((client) => client.batch<TResult>(requests));
  }

  private async withFallback<TResult>(
    operation: (client: JsonRpcTransport) => Promise<TResult>,
  ): Promise<TResult> {
    try {
      return await operation(this.primary);
    } catch (error) {
      if (error instanceof UpstreamSourceError && !error.retryable) {
        throw error;
      }
      return operation(this.secondary);
    }
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function resultFromRpcResponse<TResult>(response: {
  result?: TResult;
  error?: { code: number; message: string };
}): TResult {
  if (response.error) {
    throw new UpstreamSourceError(
      "json-rpc",
      response.error.message,
      response.error.code <= -32000,
    );
  }
  if (response.result === undefined) {
    throw new UpstreamSourceError(
      "json-rpc",
      "JSON-RPC response did not include result",
      true,
    );
  }
  return response.result;
}

export type CircuitBreakerOptions = {
  failureThreshold: number;
  resetAfterMs: number;
  now?: () => number;
};

export function createCircuitBreaker(options: CircuitBreakerOptions) {
  let failures = 0;
  let openedAt: number | null = null;
  const now = options.now ?? Date.now;

  return {
    async run<T>(operation: () => Promise<T>): Promise<T> {
      if (openedAt !== null && now() - openedAt < options.resetAfterMs) {
        throw new UpstreamSourceError(
          "circuit-breaker",
          "Circuit breaker is open",
          true,
        );
      }

      if (openedAt !== null && now() - openedAt >= options.resetAfterMs) {
        openedAt = null;
        failures = 0;
      }

      try {
        const result = await operation();
        failures = 0;
        return result;
      } catch (error) {
        failures += 1;
        if (failures >= options.failureThreshold) {
          openedAt = now();
        }

        throw error;
      }
    },

    state(): "closed" | "open" {
      return openedAt === null ? "closed" : "open";
    },
  };
}

export const protocolSourcePolicies: ProtocolSourcePolicy[] = [
  {
    protocolId: "aave-v3",
    priority: [
      {
        source: "official-api",
        label: "Aave v3 GraphQL",
        envKey: "AAVE_V3_GRAPHQL_URL",
        requiredForExactQuote: false,
      },
      {
        source: "on-chain",
        label: "Aave v3 reserve/user reads",
        envKey: "ETHEREUM_RPC_URL",
        requiredForExactQuote: true,
      },
    ],
  },
  {
    protocolId: "aave-v4",
    priority: [
      {
        source: "official-api",
        label: "Aave v4 GraphQL",
        envKey: "AAVE_V4_GRAPHQL_URL",
        requiredForExactQuote: true,
      },
      {
        source: "on-chain",
        label: "Aave v4 hub/spoke reads",
        envKey: "ETHEREUM_RPC_URL",
        requiredForExactQuote: true,
      },
    ],
  },
  {
    protocolId: "morpho-blue",
    priority: [
      {
        source: "official-api",
        label: "Morpho GraphQL",
        envKey: "MORPHO_GRAPHQL_URL",
        requiredForExactQuote: true,
      },
      {
        source: "on-chain",
        label: "Morpho Blue direct market reads",
        envKey: "ETHEREUM_RPC_URL",
        requiredForExactQuote: false,
      },
    ],
  },
  {
    protocolId: "euler-v2",
    priority: [
      {
        source: "on-chain",
        label: "Euler lens contracts",
        envKey: "ETHEREUM_RPC_URL",
        requiredForExactQuote: true,
      },
      {
        source: "official-api",
        label: "Euler SDK/data endpoint",
        envKey: "EULER_DATA_URL",
        requiredForExactQuote: false,
      },
    ],
  },
  {
    protocolId: "compound-iii",
    priority: [
      {
        source: "on-chain",
        label: "Compound Comet and Configurator reads",
        envKey: "ETHEREUM_RPC_URL",
        requiredForExactQuote: true,
      },
    ],
  },
  {
    protocolId: "sparklend",
    priority: [
      {
        source: "on-chain",
        label: "Spark UiPoolDataProviderV3 reads",
        envKey: "ETHEREUM_RPC_URL",
        requiredForExactQuote: true,
      },
      {
        source: "official-api",
        label: "Spark utilities and indexed data",
        envKey: "SPARK_DATA_URL",
        requiredForExactQuote: false,
      },
    ],
  },
  {
    protocolId: "portfolio",
    priority: [
      {
        source: "on-chain",
        label: "Ethereum mainnet curated registry batch reads",
        envKey: "ETHEREUM_RPC_URL",
        requiredForExactQuote: true,
      },
    ],
  },
];

export function policyForProtocol(
  protocolId: string,
): ProtocolSourcePolicy | undefined {
  return protocolSourcePolicies.find(
    (policy) => policy.protocolId === protocolId,
  );
}

export function evaluateSourceReadiness(
  env: Record<string, string | null | undefined>,
): SourceReadinessReport {
  const protocols = protocolSourcePolicies.map((policy) => {
    const implemented = IMPLEMENTED_LIVE_PROTOCOLS.has(policy.protocolId);
    const sources = policy.priority.map((source) => ({
      ...source,
      configured: source.envKey ? hasEnvValue(env[source.envKey]) : true,
    }));
    const missingRequiredEnvKeys = sources
      .filter(
        (source) =>
          source.requiredForExactQuote && source.envKey && !source.configured,
      )
      .map((source) => source.envKey as string);

    return {
      protocolId: policy.protocolId,
      implemented,
      exactQuoteReady: implemented && missingRequiredEnvKeys.length === 0,
      missingRequiredEnvKeys: implemented ? missingRequiredEnvKeys : [],
      sources,
    };
  });
  const missingRequiredEnvKeys = [
    ...new Set(
      protocols.flatMap((protocol) => protocol.missingRequiredEnvKeys),
    ),
  ].sort();

  return {
    liveReady: protocols.some(
      (protocol) =>
        protocol.protocolId !== "portfolio" && protocol.exactQuoteReady,
    ),
    missingRequiredEnvKeys,
    protocols,
  };
}

export function createLiveSourceClients(
  config: LiveSourceClientConfig,
  options: LiveSourceClientOptions = {},
): LiveSourceClients {
  const timeoutMs = options.timeoutMs ?? 2_500;
  const clients: LiveSourceClients["clients"] = {};
  const ethereumRpcUrl = envValue(config.ETHEREUM_RPC_URL);
  const aaveV3GraphQlUrl = envValue(config.AAVE_V3_GRAPHQL_URL);
  const aaveV4GraphQlUrl = envValue(config.AAVE_V4_GRAPHQL_URL);
  const morphoGraphQlUrl = envValue(config.MORPHO_GRAPHQL_URL);
  const eulerDataUrl = envValue(config.EULER_DATA_URL);
  const sparkDataUrl = envValue(config.SPARK_DATA_URL);
  const alchemyApiKey = envValue(config.ALCHEMY_API_KEY);
  const diagnostics: SourceClientDiagnostic[] = [
    diagnostic(
      "ethereumRpc",
      "ETHEREUM_RPC_URL",
      "json-rpc",
      config.ETHEREUM_RPC_URL,
      timeoutMs,
    ),
    diagnostic(
      "aaveV3GraphQl",
      "AAVE_V3_GRAPHQL_URL",
      "graphql",
      config.AAVE_V3_GRAPHQL_URL,
      timeoutMs,
    ),
    diagnostic(
      "aaveV4GraphQl",
      "AAVE_V4_GRAPHQL_URL",
      "graphql",
      config.AAVE_V4_GRAPHQL_URL,
      timeoutMs,
    ),
    diagnostic(
      "morphoGraphQl",
      "MORPHO_GRAPHQL_URL",
      "graphql",
      config.MORPHO_GRAPHQL_URL,
      timeoutMs,
    ),
    diagnostic(
      "eulerData",
      "EULER_DATA_URL",
      "http-json",
      config.EULER_DATA_URL,
      timeoutMs,
    ),
    diagnostic(
      "sparkData",
      "SPARK_DATA_URL",
      "http-json",
      config.SPARK_DATA_URL,
      timeoutMs,
    ),
    diagnostic(
      "alchemyRpc",
      "ALCHEMY_API_KEY",
      "json-rpc",
      config.ALCHEMY_API_KEY,
      timeoutMs,
    ),
  ];

  const primaryEthereumRpc = ethereumRpcUrl
    ? new JsonRpcClient(
        httpOptions(ethereumRpcUrl, timeoutMs, options.fetchImpl),
      )
    : undefined;

  if (aaveV3GraphQlUrl) {
    clients.aaveV3GraphQl = new GraphQlClient(
      httpOptions(aaveV3GraphQlUrl, timeoutMs, options.fetchImpl),
    );
  }

  if (aaveV4GraphQlUrl) {
    clients.aaveV4GraphQl = new GraphQlClient(
      httpOptions(aaveV4GraphQlUrl, timeoutMs, options.fetchImpl),
    );
  }

  if (morphoGraphQlUrl) {
    clients.morphoGraphQl = new GraphQlClient(
      httpOptions(morphoGraphQlUrl, timeoutMs, options.fetchImpl),
    );
  }

  if (eulerDataUrl) {
    clients.eulerData = new HttpJsonClient(
      httpOptions(eulerDataUrl, timeoutMs, options.fetchImpl),
    );
  }

  if (sparkDataUrl) {
    clients.sparkData = new HttpJsonClient(
      httpOptions(sparkDataUrl, timeoutMs, options.fetchImpl),
    );
  }

  if (alchemyApiKey) {
    clients.alchemyRpc = new JsonRpcClient(
      httpOptions(
        `https://eth-mainnet.g.alchemy.com/v2/${alchemyApiKey}`,
        timeoutMs,
        options.fetchImpl,
      ),
    );
  }

  if (primaryEthereumRpc && clients.alchemyRpc) {
    clients.ethereumRpc = new FallbackJsonRpcClient(
      primaryEthereumRpc,
      clients.alchemyRpc,
    );
  } else if (primaryEthereumRpc) {
    clients.ethereumRpc = primaryEthereumRpc;
  } else if (clients.alchemyRpc) {
    clients.ethereumRpc = clients.alchemyRpc;
  }

  return {
    readiness: evaluateSourceReadiness(config),
    diagnostics,
    clients,
  };
}

export function provenanceFromPolicy(protocolId: string): QuoteProvenance[] {
  const policy = policyForProtocol(protocolId);
  if (!policy) {
    return [];
  }

  return policy.priority.map((item) => ({
    source: item.label,
    sourceType:
      item.source === "official-api"
        ? "official-api"
        : item.source === "on-chain"
          ? "on-chain"
          : item.source === "fallback"
            ? "fallback"
            : "fixture",
  }));
}

function hasEnvValue(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function envValue(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function httpOptions(
  baseUrl: string,
  timeoutMs: number,
  fetchImpl?: typeof fetch,
): HttpClientOptions {
  return {
    baseUrl,
    timeoutMs,
    ...(fetchImpl ? { fetchImpl } : {}),
  };
}

function diagnostic(
  id: SourceClientId,
  envKey: keyof LiveSourceClientConfig,
  clientType: SourceClientDiagnostic["clientType"],
  value: string | null | undefined,
  timeoutMs: number,
): SourceClientDiagnostic {
  return {
    id,
    envKey,
    configured: hasEnvValue(value),
    clientType,
    timeoutMs,
  };
}
