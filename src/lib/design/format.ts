export function formatCompactNumber(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })
    .format(n)
    // Some ICU builds insert a narrow/non-breaking space (U+202F, U+00A0) before the K/M suffix; strip all whitespace.
    .replace(/[\s   ]/g, "");
}
export function formatVelocity(n: number, window: string): string {
  return `${formatCompactNumber(n)} / ${window}`;
}
export function formatShortcut(keys: string[]): string {
  return keys.join("");
}
