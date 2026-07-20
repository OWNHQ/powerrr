import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createEngineHttpHandler } from "./http.js";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 4000);
const maxBodyBytes = positiveInteger(
  process.env.POWERRR_MAX_BODY_BYTES,
  64 * 1024,
);
const handler = createEngineHttpHandler();

const server = createServer(async (request, response) => {
  const bodyResult = await readJsonBody(request, maxBodyBytes);

  if (!bodyResult.ok) {
    writeJson(response, 400, {
      error: {
        code: "INVALID_INPUT",
        message: bodyResult.message,
      },
    });
    return;
  }

  const remoteAddress = request.socket.remoteAddress;
  const result = await handler({
    method: request.method ?? "GET",
    path: request.url ?? "/",
    body: bodyResult.body,
    headers: request.headers,
    ...(remoteAddress ? { remoteAddress } : {}),
  });

  writeJson(response, result.statusCode, result.body, result.headers);
});

server.listen(port, host, () => {
  process.stdout.write(`Powerrr engine listening on http://${host}:${port}\n`);
});

server.requestTimeout = positiveInteger(
  process.env.POWERRR_REQUEST_TIMEOUT_MS,
  15_000,
);
server.headersTimeout = positiveInteger(
  process.env.POWERRR_HEADERS_TIMEOUT_MS,
  10_000,
);
server.keepAliveTimeout = positiveInteger(
  process.env.POWERRR_KEEP_ALIVE_TIMEOUT_MS,
  5_000,
);

async function readJsonBody(
  request: IncomingMessage,
  limitBytes: number,
): Promise<{ ok: true; body: unknown } | { ok: false; message: string }> {
  if (request.method === "GET" || request.method === "HEAD") {
    return { ok: true, body: undefined };
  }

  const chunks: Buffer[] = [];
  let receivedBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    receivedBytes += buffer.byteLength;
    if (receivedBytes > limitBytes) {
      return {
        ok: false,
        message: `Request body exceeds the ${limitBytes} byte limit`,
      };
    }
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return { ok: true, body: {} };
  }

  try {
    return {
      ok: true,
      body: JSON.parse(raw),
    };
  } catch {
    return {
      ok: false,
      message: "Request body must be valid JSON",
    };
  }
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  },
): void {
  response.writeHead(statusCode, headers);
  response.end(JSON.stringify(body));
}
