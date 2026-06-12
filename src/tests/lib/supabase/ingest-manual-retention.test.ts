import { describe, it, expect } from 'vitest';
import { ingestManualRetention } from '@/lib/supabase/repositories/video-analytics';

function mockSupabase(prior: Record<string, unknown> | null) {
  let captured: Record<string, unknown> | null = null;
  const supabase = {
    from: (table: string) => {
      if (table !== 'video_analytics') throw new Error('wrong table');
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({ maybeSingle: async () => ({ data: prior, error: null }) }),
            }),
          }),
        }),
        upsert: (values: Record<string, unknown>, opts?: { onConflict?: string }) => {
          captured = { ...values, __onConflict: opts?.onConflict };
          return { error: null };
        },
      };
    },
  } as never;
  return { supabase, get captured() { return captured; } };
}

// Distinct buckets at 30s (0.3) and 60s (0.6) marks for duration=100.
const CURVE = [
  { elapsedVideoTimeRatio: 0, audienceWatchRatio: 1 },
  { elapsedVideoTimeRatio: 0.3, audienceWatchRatio: 0.6 },
  { elapsedVideoTimeRatio: 0.6, audienceWatchRatio: 0.4 },
  { elapsedVideoTimeRatio: 1, audienceWatchRatio: 0.2 },
];

describe('ingestManualRetention', () => {
  it('carries forward scalars, stores the curve, and computes derived opening-hold columns', async () => {
    const m = mockSupabase({
      views: 16, likes: 2, comments: 0, shares: null,
      avg_view_duration_seconds: 58, ctr_pct: 2.9, subscribers_gained: 1,
      impressions: 280, watch_time_seconds: 928,
    });
    const res = await ingestManualRetention(m.supabase, {
      yourVideoId: 'v1', curve: CURVE, durationSeconds: 100,
    });
    expect(res.points).toBe(4);
    // carried forward
    expect(m.captured!.views).toBe(16);
    expect(m.captured!.avg_view_duration_seconds).toBe(58);
    expect(m.captured!.impressions).toBe(280);
    // curve stored
    expect(m.captured!.retention_curve_jsonb).toEqual(CURVE);
    expect(m.captured!.__onConflict).toBe('your_video_id,snapshot_at');
    // derived (summarizeOpeningRetention nearest-bucket: 30s->0.3->0.6, 60s->0.6->0.4)
    expect(m.captured!.first_30s_retention).toBeCloseTo(0.6);
    expect(m.captured!.first_60s_retention).toBeCloseTo(0.4);
    expect(m.captured!.relative_retention_opening).toBeNull(); // manual paste has no peer data
    expect(res.first30sRetention).toBeCloseTo(0.6);
  });

  it('lets an explicit metricsOverride win over the carried-forward value', async () => {
    const m = mockSupabase({ views: 16, avg_view_duration_seconds: 58 });
    await ingestManualRetention(m.supabase, {
      yourVideoId: 'v1', curve: CURVE, durationSeconds: 100, metricsOverride: { views: 999 },
    });
    expect(m.captured!.views).toBe(999);
    expect(m.captured!.avg_view_duration_seconds).toBe(58);
  });

  it('writes a curve row with null scalars + null derived when no prior snapshot and no duration', async () => {
    const m = mockSupabase(null);
    await ingestManualRetention(m.supabase, { yourVideoId: 'v1', curve: CURVE, durationSeconds: null });
    expect(m.captured!.views).toBeNull();
    expect(m.captured!.retention_curve_jsonb).toEqual(CURVE);
    expect(m.captured!.first_30s_retention).toBeNull(); // no duration -> summarize returns nulls
  });
});
