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
