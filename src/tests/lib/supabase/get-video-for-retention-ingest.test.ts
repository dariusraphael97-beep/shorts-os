import { describe, it, expect } from 'vitest';
import { getVideoForRetentionIngest } from '@/lib/supabase/repositories/your-videos';

function mockSupabase(
  row: { id: string; duration_seconds: number | null } | null,
  error: { code?: string; message: string } | null = null,
) {
  let capturedCol: string | null = null;
  const supabase = {
    from: (table: string) => {
      if (table !== 'your_videos') throw new Error('wrong table');
      return {
        select: () => ({
          eq: (col: string) => {
            capturedCol = col;
            return { maybeSingle: async () => ({ data: row, error }) };
          },
        }),
      };
    },
  } as never;
  return { supabase, get capturedCol() { return capturedCol; } };
}

describe('getVideoForRetentionIngest', () => {
  it('resolves by external_video_id', async () => {
    const m = mockSupabase({ id: 'internal-uuid', duration_seconds: 503 });
    const v = await getVideoForRetentionIngest(m.supabase, { externalVideoId: 'GwC66BSw7wU' });
    expect(v).toEqual({ id: 'internal-uuid', durationSeconds: 503 });
    expect(m.capturedCol).toBe('external_video_id');
  });

  it('resolves by yourVideoId', async () => {
    const m = mockSupabase({ id: 'internal-uuid', duration_seconds: null });
    const v = await getVideoForRetentionIngest(m.supabase, { yourVideoId: 'internal-uuid' });
    expect(v).toEqual({ id: 'internal-uuid', durationSeconds: null });
    expect(m.capturedCol).toBe('id');
  });

  it('returns null when no row matches', async () => {
    const v = await getVideoForRetentionIngest(mockSupabase(null).supabase, { externalVideoId: 'nope' });
    expect(v).toBeNull();
  });

  it('throws on a non-PGRST116 db error', async () => {
    await expect(
      getVideoForRetentionIngest(mockSupabase(null, { code: 'XX000', message: 'boom' }).supabase, {
        yourVideoId: 'x',
      }),
    ).rejects.toThrow('getVideoForRetentionIngest: boom');
  });
});
