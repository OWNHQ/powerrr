export function formatLocalDateTime(
  value: string,
  locale?: string,
  timeZone?: string,
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "medium",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}
