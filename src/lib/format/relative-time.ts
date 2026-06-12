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
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
