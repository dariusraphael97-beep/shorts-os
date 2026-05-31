export interface DailyQuota { date: string; quota: number; }

/** Sum YouTube quota_units per UTC day (YYYY-MM-DD), sorted ascending. */
export function aggregateQuotaByDay(runs: Array<{ started_at: string; quota_units: number }>): DailyQuota[] {
  const byDay = new Map<string, number>();
  for (const r of runs) {
    const day = r.started_at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + (r.quota_units ?? 0));
  }
  return [...byDay.entries()]
    .map(([date, quota]) => ({ date, quota }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
