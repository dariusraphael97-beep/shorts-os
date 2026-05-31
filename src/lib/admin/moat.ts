import { computeLagDays, type VidiqAppearance } from "@/lib/supabase/repositories/vidiq-appearances";

type ExternalFields = Pick<VidiqAppearance,
  | "first_surfaced_by_shorts_os_at"
  | "first_surfaced_by_vidiq_at"
  | "first_surfaced_by_1of10_at"
  | "first_surfaced_by_exploding_topics_at">;

/** Days from our surfacing to the EARLIEST external tool's surfacing; null if none. */
export function earliestExternalLagDays(a: ExternalFields): number | null {
  const externals = [a.first_surfaced_by_vidiq_at, a.first_surfaced_by_1of10_at, a.first_surfaced_by_exploding_topics_at]
    .filter((d): d is string => d !== null)
    .map((d) => new Date(d).getTime());
  if (externals.length === 0) return null;
  const earliest = new Date(Math.min(...externals));
  return computeLagDays(new Date(a.first_surfaced_by_shorts_os_at), earliest);
}

export function averageLagDays(rows: ExternalFields[]): number | null {
  const lags = rows.map(earliestExternalLagDays).filter((n): n is number => n !== null);
  if (lags.length === 0) return null;
  return Math.round(lags.reduce((s, n) => s + n, 0) / lags.length);
}
