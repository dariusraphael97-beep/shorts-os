import { describe, it, expect, vi } from 'vitest';
import { markPosted } from '@/lib/supabase/repositories/your-videos';

describe('markPosted', () => {
  it('writes external_video_id, url, posted_at, posted_hour_local, posted_dow_local, status', async () => {
    let captured: Record<string, unknown> | null = null;
    const supabase = {
      from: (table: string) => {
        if (table !== 'your_videos') throw new Error('wrong table');
        return {
          update: (patch: Record<string, unknown>) => ({
            eq: async () => { captured = patch; return { error: null }; },
          }),
        };
      },
    } as never;
    const now = new Date('2026-05-27T22:30:00Z'); // 18:30 ET (EDT) = local hour 18, dow 3 (Wed)
    await markPosted(supabase, {
      videoId: 'v1',
      externalVideoId: 'YT_ID',
      url: 'https://www.youtube.com/shorts/YT_ID',
      postedAt: now,
      channelTimezone: 'America/New_York',
    });
    expect(captured!.external_video_id).toBe('YT_ID');
    expect(captured!.url).toBe('https://www.youtube.com/shorts/YT_ID');
    expect(captured!.status).toBe('posted');
    expect(captured!.posted_at).toBe(now.toISOString());
    expect(captured!.posted_hour_local).toBe(18);
    expect(captured!.posted_dow_local).toBe(3); // 0=Sun..6=Sat; Wed=3
  });

  it('handles a Sunday posted_dow_local=0 across DST (Nov 1 2026 fall-back, 02:30 UTC = 22:30 ET Oct 31, Sat=6)', async () => {
    let captured: Record<string, unknown> | null = null;
    const supabase = {
      from: () => ({
        update: (patch: Record<string, unknown>) => ({
          eq: async () => { captured = patch; return { error: null }; },
        }),
      }),
    } as never;
    const now = new Date('2026-11-01T02:30:00Z'); // 22:30 ET Oct 31 (DST still in effect)
    await markPosted(supabase, {
      videoId: 'v1', externalVideoId: 'YT', url: 'u', postedAt: now,
      channelTimezone: 'America/New_York',
    });
    expect(captured!.posted_hour_local).toBe(22);
    expect(captured!.posted_dow_local).toBe(6); // Saturday in ET
  });
});
