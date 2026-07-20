export function addressInputRateLimitSubject(
  body: unknown,
): string | undefined {
  if (typeof body !== "object" || body === null || !("input" in body)) {
    return undefined;
  }

  const input = (body as { input?: unknown }).input;
  if (typeof input !== "object" || input === null) {
    return undefined;
  }

  const address = (input as { address?: unknown }).address;
  if (typeof address === "string" && address.trim()) {
    return address.trim().toLowerCase();
  }

  const ensName = (input as { ensName?: unknown }).ensName;
  if (typeof ensName === "string" && ensName.trim()) {
    return ensName.trim().toLowerCase();
  }

  return undefined;
}
