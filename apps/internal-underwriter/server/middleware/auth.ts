import { timingSafeEqual } from "node:crypto";
import { createError, getHeader, setHeader } from "h3";

export default defineEventHandler((event) => {
  setHeader(event, "cache-control", "no-store");
  setHeader(
    event,
    "content-security-policy",
    "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  setHeader(event, "referrer-policy", "no-referrer");
  setHeader(event, "x-content-type-options", "nosniff");
  setHeader(event, "x-frame-options", "DENY");
  setHeader(
    event,
    "permissions-policy",
    "camera=(), geolocation=(), microphone=()",
  );

  const config = useRuntimeConfig(event);
  const username = String(config.underwriterUsername ?? "");
  const password = String(config.underwriterPassword ?? "");
  const production = process.env.NODE_ENV === "production";

  if (!username || !password) {
    if (!production) {
      return;
    }

    throw createError({
      statusCode: 503,
      statusMessage: "Internal workbench credentials are not configured",
    });
  }

  const credentials = parseBasicCredentials(getHeader(event, "authorization"));
  if (
    credentials &&
    secureEqual(credentials.username, username) &&
    secureEqual(credentials.password, password)
  ) {
    return;
  }

  setHeader(
    event,
    "www-authenticate",
    'Basic realm="Powerrr Underwriter", charset="UTF-8"',
  );
  throw createError({
    statusCode: 401,
    statusMessage: "Authentication required",
  });
});

function parseBasicCredentials(
  header: string | undefined,
): { username: string; password: string } | null {
  if (!header?.startsWith("Basic ")) {
    return null;
  }

  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) {
      return null;
    }

    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
