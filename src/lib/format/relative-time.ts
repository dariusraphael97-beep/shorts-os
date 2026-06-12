// Tiny relative-time formatter for ledger timestamps. Client-safe.
export function relativeTime(iso: string, now: Date = new Date()): string {
  const thenMs = new Date(iso).getTime();
  if (Number.isNaN(thenMs)) return '';
  const sec = Math.max(0, Math.round((now.getTime() - thenMs) / 1000));
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const then = new Date(iso);
  // Include the year when it isn't the current one, so "Jun 3" a year ago
  // isn't indistinguishable from a recent date.
  return then.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(then.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}
