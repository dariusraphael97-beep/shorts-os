import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface UpsertParams {
  yourVideoId: string;
  snapshotAt: Date;
  views: bigint | number | null;
  likes: bigint | number | null;
  comments: bigint | number | null;
  shares: bigint | number | null;
  avgViewDurationSeconds: number | null;
  ctrPct: number | null;
  subscribersGained: number | null;
  impressions: bigint | number | null;
  watchTimeSeconds: bigint | number | null;
  retentionCurve: unknown;
  /** Derived opening-hold numbers (from summarizeOpeningRetention) — the L2 playbook's primary signal.
   *  Optional: callers predating the L2 retention work simply omit them (stored as null). */
  first30sRetention?: number | null;
  first60sRetention?: number | null;
  relativeRetentionOpening?: number | null;
  rawPayload: unknown;
}

export async function upsertVideoAnalytics(
  supabase: SupabaseClient,
  params: UpsertParams,
): Promise<void> {
  const { error } = await supabase.from('video_analytics').upsert(
    {
      your_video_id: params.yourVideoId,
      snapshot_at: params.snapshotAt.toISOString(),
      views: params.views,
      likes: params.likes,
      comments: params.comments,
      shares: params.shares,
      avg_view_duration_seconds: params.avgViewDurationSeconds,
      ctr_pct: params.ctrPct,
      subscribers_gained: params.subscribersGained,
      impressions: params.impressions,
      watch_time_seconds: params.watchTimeSeconds,
      retention_curve_jsonb: params.retentionCurve,
      first_30s_retention: params.first30sRetention ?? null,
      first_60s_retention: params.first60sRetention ?? null,
      relative_retention_opening: params.relativeRetentionOpening ?? null,
      raw_payload: params.rawPayload,
    },
    { onConflict: 'your_video_id,snapshot_at' },
  );
  if (error) throw new Error(`upsertVideoAnalytics: ${error.message}`);
}
