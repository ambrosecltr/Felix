export function formatTokenCount(value: number): string {
  if (value < 1000) return String(value);
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: value < 1_000_000 ? 0 : 1,
  }).format(value);
}

export function formatFullTokenCount(value: number): string {
  return new Intl.NumberFormat("en").format(value);
}

export function formatInteger(value: number): string {
  return new Intl.NumberFormat("en").format(value);
}

export function formatBuildDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) return totalMinutes === 1 ? "1 min" : `${totalMinutes} mins`;

  const totalHours = Math.round(totalMinutes / 60);
  if (totalHours < 24) return totalHours === 1 ? "1 hr" : `${totalHours} hrs`;

  const totalDays = Math.round(totalHours / 24);
  return totalDays === 1 ? "1 day" : `${totalDays} days`;
}
