import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { summarizeOpeningRetention, type RetentionCurvePoint } from '../../longform/retention';

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

export interface VideoAnalyticsSnapshot {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  avg_view_duration_seconds: number | null;
  ctr_pct: number | null;
  subscribers_gained: number | null;
  impressions: number | null;
  watch_time_seconds: number | null;
}

export async function getLatestSnapshot(
  supabase: SupabaseClient,
  yourVideoId: string,
): Promise<VideoAnalyticsSnapshot | null> {
  const { data, error } = await supabase
    .from('video_analytics')
    .select(
      'views, likes, comments, shares, avg_view_duration_seconds, ctr_pct, subscribers_gained, impressions, watch_time_seconds',
    )
    .eq('your_video_id', yourVideoId)
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && (error as { code?: string }).code !== 'PGRST116') {
    throw new Error(`getLatestSnapshot: ${error.message}`);
  }
  return (data as VideoAnalyticsSnapshot | null) ?? null;
}

export interface ManualMetricsOverride {
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  avgViewDurationSeconds?: number | null;
  ctrPct?: number | null;
  subscribersGained?: number | null;
  impressions?: number | null;
  watchTimeSeconds?: number | null;
}

/**
 * Ingest a manually-supplied retention curve as a NEW snapshot at `snapshotAt`
 * (default now). Carries forward the latest snapshot's scalar metrics (so the
 * newest row stays complete for `longform_decision_outcomes`); any field in
 * `metricsOverride` wins. Recomputes the derived opening-hold columns from the
 * new curve via summarizeOpeningRetention so the L2 distiller sees it. Reuses the
 * single writer `upsertVideoAnalytics`.
 */
export async function ingestManualRetention(
  supabase: SupabaseClient,
  params: {
    yourVideoId: string;
    curve: RetentionCurvePoint[];
    durationSeconds: number | null;
    metricsOverride?: ManualMetricsOverride;
    snapshotAt?: Date;
    rawPayload?: unknown;
  },
): Promise<{ points: number; snapshotAt: string; first30sRetention: number | null }> {
  const prev = await getLatestSnapshot(supabase, params.yourVideoId);
  const o = params.metricsOverride ?? {};
  const snapshotAt = params.snapshotAt ?? new Date();
  const opening = summarizeOpeningRetention(params.curve, params.durationSeconds);
  const pick = <T>(override: T | undefined, prior: T | null | undefined): T | null =>
    override !== undefined ? override : (prior ?? null);

  await upsertVideoAnalytics(supabase, {
    yourVideoId: params.yourVideoId,
    snapshotAt,
    views: pick(o.views, prev?.views),
    likes: pick(o.likes, prev?.likes),
    comments: pick(o.comments, prev?.comments),
    shares: pick(o.shares, prev?.shares),
    avgViewDurationSeconds: pick(o.avgViewDurationSeconds, prev?.avg_view_duration_seconds),
    ctrPct: pick(o.ctrPct, prev?.ctr_pct),
    subscribersGained: pick(o.subscribersGained, prev?.subscribers_gained),
    impressions: pick(o.impressions, prev?.impressions),
    watchTimeSeconds: pick(o.watchTimeSeconds, prev?.watch_time_seconds),
    retentionCurve: params.curve,
    first30sRetention: opening.first30sRetention,
    first60sRetention: opening.first60sRetention,
    relativeRetentionOpening: opening.relativeRetentionOpening,
    rawPayload: params.rawPayload ?? { source: 'manual', importedAt: snapshotAt.toISOString() },
  });

  return {
    points: params.curve.length,
    snapshotAt: snapshotAt.toISOString(),
    first30sRetention: opening.first30sRetention,
  };
}
