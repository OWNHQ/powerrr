import { createError, getHeader, setHeader } from "h3";

export default defineEventHandler((event) => {
  setHeader(
    event,
    "content-security-policy",
    "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  setHeader(event, "referrer-policy", "strict-origin-when-cross-origin");
  setHeader(event, "x-content-type-options", "nosniff");
  setHeader(event, "x-frame-options", "DENY");
  setHeader(
    event,
    "permissions-policy",
    "camera=(), geolocation=(), microphone=()",
  );
  if (process.env.NODE_ENV === "production") {
    setHeader(
      event,
      "strict-transport-security",
      "max-age=31536000; includeSubDomains",
    );
  }

  const contentLength = Number(getHeader(event, "content-length") ?? 0);
  if (
    event.path.startsWith("/api/") &&
    event.method !== "GET" &&
    Number.isFinite(contentLength) &&
    contentLength > 64 * 1024
  ) {
    throw createError({
      statusCode: 413,
      statusMessage: "Request body is too large",
    });
  }

  if (event.path.startsWith("/api/") && !isRuntimeDiagnostic(event.path)) {
    const readiness = useRuntimeConfigurationReadiness();
    if (
      readiness.runtimeTier === "production" &&
      !readiness.productionPrerequisitesSatisfied
    ) {
      throw createError({
        statusCode: 503,
        statusMessage: "Production runtime is not ready",
        data: {
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "The service is not ready to accept production requests.",
          },
        },
      });
    }
  }
});

function isRuntimeDiagnostic(path: string): boolean {
  return ["/api/v1/livez", "/api/v1/healthz", "/api/v1/version"].includes(path);
}
