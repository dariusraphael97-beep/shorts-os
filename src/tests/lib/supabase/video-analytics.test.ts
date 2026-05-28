import { describe, it, expect } from 'vitest';
import { upsertVideoAnalytics } from '@/lib/supabase/repositories/video-analytics';

describe('upsertVideoAnalytics', () => {
  it('upserts by (your_video_id, snapshot_at::date) — passes onConflict', async () => {
    let captured: { values: Record<string, unknown>; onConflict?: string } | null = null;
    const supabase = {
      from: (table: string) => {
        if (table !== 'video_analytics') throw new Error('wrong table');
        return {
          upsert: (values: Record<string, unknown>, opts?: { onConflict?: string }) => {
            captured = { values, onConflict: opts?.onConflict };
            return { error: null };
          },
        };
      },
    } as never;
    await upsertVideoAnalytics(supabase, {
      yourVideoId: 'v1',
      snapshotAt: new Date('2026-05-27T07:00:00Z'),
      views: 1000n,
      likes: 50n,
      comments: 5n,
      shares: 2n,
      avgViewDurationSeconds: 23.4,
      ctrPct: 5.1,
      subscribersGained: 3,
      impressions: 8000n,
      watchTimeSeconds: 23400n,
      retentionCurve: [{ elapsedVideoTimeRatio: 0, audienceWatchRatio: 1 }],
      rawPayload: { foo: 'bar' },
    });
    expect(captured!.onConflict).toBe('your_video_id,snapshot_at');
    expect(captured!.values.views).toBe(1000n);
    expect(captured!.values.retention_curve_jsonb).toEqual([{ elapsedVideoTimeRatio: 0, audienceWatchRatio: 1 }]);
  });
});
