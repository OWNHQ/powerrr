export type SourceReadHealth = {
  sourceId: string;
  lastAttemptAt: string;
  lastSuccessAt?: string;
  lastDurationMs: number;
  status: "available" | "unavailable";
  code?: string;
};

const sourceReads = new Map<string, SourceReadHealth>();

export function recordSourceRead(input: {
  sourceId: string;
  success: boolean;
  durationMs: number;
  code?: string;
  at?: Date;
}): void {
  const at = (input.at ?? new Date()).toISOString();
  const previous = sourceReads.get(input.sourceId);
  sourceReads.set(input.sourceId, {
    sourceId: input.sourceId,
    lastAttemptAt: at,
    ...(input.success
      ? { lastSuccessAt: at }
      : previous?.lastSuccessAt
        ? { lastSuccessAt: previous.lastSuccessAt }
        : {}),
    lastDurationMs: Math.max(0, Math.round(input.durationMs)),
    status: input.success ? "available" : "unavailable",
    ...(input.code ? { code: input.code } : {}),
  });
}

export function sourceReadHealthSnapshot(): SourceReadHealth[] {
  return [...sourceReads.values()].sort((a, b) =>
    a.sourceId.localeCompare(b.sourceId),
  );
}

export function clearSourceReadHealthForTests(): void {
  sourceReads.clear();
}
