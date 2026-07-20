import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const DEFAULT_INTERNAL_API_TOKEN = "local-dev-internal-token";
export const DEFAULT_INTERNAL_SIGNING_SECRET =
  "local-dev-internal-signing-secret";
export const INTERNAL_AUTH_MAX_SKEW_MS = 5 * 60_000;

export type InternalSignatureInput = {
  method: string;
  path: string;
  timestampMs: string;
  body: unknown;
  secret: string;
};

export function isValidInternalToken(
  provided: string | string[] | undefined,
  expected: string | undefined,
): boolean {
  if (!expected || !provided || Array.isArray(provided)) {
    return false;
  }

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export function isLocalInternalTokenFallback(
  provided: string | string[] | undefined,
  expected: string | undefined,
): boolean {
  return (
    expected === DEFAULT_INTERNAL_API_TOKEN &&
    isValidInternalToken(provided, expected)
  );
}

export function signInternalRequest(input: InternalSignatureInput): string {
  return createHmac("sha256", input.secret)
    .update(internalSignaturePayload(input))
    .digest("hex");
}

export function isValidInternalSignature(
  input: InternalSignatureInput & {
    provided: string | string[] | undefined;
    nowMs?: number;
  },
): boolean {
  if (!input.secret || !input.provided || Array.isArray(input.provided)) {
    return false;
  }

  const timestampNumber = Number(input.timestampMs);
  if (!Number.isSafeInteger(timestampNumber)) {
    return false;
  }

  const now = input.nowMs ?? Date.now();
  if (Math.abs(now - timestampNumber) > INTERNAL_AUTH_MAX_SKEW_MS) {
    return false;
  }

  return timingSafeStringEqual(input.provided, signInternalRequest(input));
}

function internalSignaturePayload(input: InternalSignatureInput): string {
  return [
    input.method.toUpperCase(),
    normalizePath(input.path),
    input.timestampMs,
    sha256(canonicalStringify(input.body)),
  ].join("\n");
}

function normalizePath(path: string): string {
  return path.split("?")[0] || "/";
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`)
    .join(",")}}`;
}

function timingSafeStringEqual(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}
