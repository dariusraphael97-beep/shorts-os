import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));
vi.mock('@/lib/scrapers/shared', async () => {
  const actual = await vi.importActual<typeof import('@/lib/scrapers/shared')>('@/lib/scrapers/shared');
  return { ...actual, assertCronAuth: vi.fn() };
});
vi.mock('@/lib/clients/google-oauth', () => ({
  refreshAccessToken: vi.fn(async () => ({ accessToken: 'AT', expiresIn: 3599 })),
  GoogleTokenError: class extends Error {},
}));
vi.mock('@/lib/clients/youtube-analytics', () => ({
  fetchVideoStats: vi.fn(async () => ({ views: 100, likes: 10, comments: 1 })),
  fetchCoreReport: vi.fn(async () => ({
    estimatedMinutesWatched: 50, averageViewDurationSeconds: 30, subscribersGained: 2,
    impressions: 800, ctrPct: 4.5,
  })),
  fetchRetentionReport: vi.fn(async () => [{ elapsedVideoTimeRatio: 0, audienceWatchRatio: 1 }]),
}));
vi.mock('@/lib/supabase/repositories/video-analytics', () => ({
  upsertVideoAnalytics: vi.fn(),
}));
vi.mock('@/lib/supabase/repositories/channels', () => ({
  loadEncryptedRefreshToken: vi.fn(async () => 'RT'),
}));

import { GET } from '@/app/api/cron/performance-sync/route';
import { getServiceClient } from '@/lib/supabase/server';
import { upsertVideoAnalytics } from '@/lib/supabase/repositories/video-analytics';
import { fetchVideoStats } from '@/lib/clients/youtube-analytics';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'cid');
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'csecret');
  vi.stubEnv('OAUTH_TOKEN_ENCRYPTION_KEY_V1', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
  vi.stubEnv('OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION', '1');
  vi.stubEnv('ANALYTICS_SYNC_WINDOW_DAYS', '14');
});

describe('GET /api/cron/performance-sync', () => {
  it('sweeps each channel × video in window, calls upsertVideoAnalytics', async () => {
    vi.mocked(getServiceClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'channels') {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({
                  data: [{ id: 'chan-1', external_channel_id: 'UC_X', timezone: 'America/New_York' }],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'your_videos') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  gte: async () => ({
                    data: [{ id: 'v1', external_video_id: 'EXT_1', channel_id: 'chan-1', posted_at: new Date().toISOString() }],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        throw new Error('unmocked table ' + table);
      },
    } as never);

    const req = new Request('https://app/api/cron/performance-sync', { headers: { authorization: 'Bearer ANYCRON' } });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(vi.mocked(fetchVideoStats)).toHaveBeenCalledWith(
      expect.objectContaining({ externalVideoId: 'EXT_1', accessToken: 'AT' }),
    );
    expect(vi.mocked(upsertVideoAnalytics)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ yourVideoId: 'v1', views: 100 }),
    );
  });
});
