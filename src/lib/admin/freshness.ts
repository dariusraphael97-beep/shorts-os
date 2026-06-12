import type { IngestionJob, IngestionStatus } from '@/lib/supabase/repositories/ingestion-runs';

export interface RunSummary { job: IngestionJob; status: IngestionStatus | null; startedAt: string | null }
export type FreshnessLevel = 'green' | 'amber' | 'red';

const H = 3_600_000;
export const EXPECTED_MAX_AGE_MS: Record<IngestionJob, number> = {
  youtube_category_sweep: 12 * H,
  watch_list_sync: 12 * H,
  youtube_shorts_search: 30 * H,
  reddit_topic_discovery: 30 * H,
  google_trends: 30 * H,
  tiktok_creative_center: 9 * 24 * H,
  classify_observations: 12 * H,
  cluster_niches: 9 * 24 * H,
  performance_sync: 30 * H,
  youtube_dominatable_sweep: 30 * H, // daily cron (07:30 UTC), same cadence band as performance_sync
};

export function freshnessFor(run: RunSummary, now: Date): { level: FreshnessLevel; reason: string } {
  if (!run.startedAt || run.status === null) return { level: 'red', reason: 'never run' };
  if (run.status === 'failed') return { level: 'red', reason: 'last run failed' };
  const ageMs = now.getTime() - new Date(run.startedAt).getTime();
  const max = EXPECTED_MAX_AGE_MS[run.job];
  if (ageMs > max * 2) return { level: 'red', reason: 'stale (no recent run)' };
  if (run.status === 'partial') return { level: 'amber', reason: 'last run partial' };
  if (ageMs > max) return { level: 'amber', reason: 'slightly stale' };
  return { level: 'green', reason: 'healthy' };
}
