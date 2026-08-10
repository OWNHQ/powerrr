export class DeadlineExceededError extends Error {
  readonly code = "DEADLINE_EXCEEDED" as const;

  constructor(message: string) {
    super(message);
    this.name = "DeadlineExceededError";
  }
}

export async function withDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  options: { onDeadline?: () => void } = {},
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      options.onDeadline?.();
      reject(new DeadlineExceededError(message));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
