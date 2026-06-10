import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchVideoStats, fetchCoreReport, fetchRetentionReport } from '@/lib/clients/youtube-analytics';

const ORIGINAL_FETCH = globalThis.fetch;
afterEach(() => { globalThis.fetch = ORIGINAL_FETCH; });

describe('youtube-analytics client', () => {
  it('fetchVideoStats hits Data API videos.list with stats part', async () => {
    globalThis.fetch = vi.fn(async (url: URL | string, init?: RequestInit) => {
      const u = new URL(String(url));
      expect(u.origin + u.pathname).toBe('https://www.googleapis.com/youtube/v3/videos');
      expect(u.searchParams.get('part')).toBe('statistics');
      expect(u.searchParams.get('id')).toBe('EXT_ID');
      expect((init?.headers as Record<string,string>)['Authorization']).toBe('Bearer AT');
      return new Response(JSON.stringify({
        items: [{ statistics: { viewCount: '1000', likeCount: '50', commentCount: '5' } }],
      }), { status: 200 });
    }) as never;
    const r = await fetchVideoStats({ accessToken: 'AT', externalVideoId: 'EXT_ID' });
    expect(r.views).toBe(1000);
    expect(r.likes).toBe(50);
    expect(r.comments).toBe(5);
  });

  it('fetchCoreReport hits youtubeAnalytics reports.query with the right metrics', async () => {
    globalThis.fetch = vi.fn(async (url: URL | string) => {
      const u = new URL(String(url));
      expect(u.origin + u.pathname).toBe('https://youtubeanalytics.googleapis.com/v2/reports');
      expect(u.searchParams.get('metrics')).toContain('estimatedMinutesWatched');
      expect(u.searchParams.get('filters')).toBe('video==EXT_ID');
      return new Response(JSON.stringify({
        columnHeaders: [
          { name: 'estimatedMinutesWatched' }, { name: 'averageViewDuration' },
          { name: 'subscribersGained' }, { name: 'impressions' }, { name: 'ctrPct' },
        ],
        rows: [[400, 25.5, 7, 8000, 4.2]],
      }), { status: 200 });
    }) as never;
    const r = await fetchCoreReport({
      accessToken: 'AT',
      externalChannelId: 'UC_X', externalVideoId: 'EXT_ID',
      startDate: '2026-05-13', endDate: '2026-05-27',
    });
    expect(r.estimatedMinutesWatched).toBe(400);
    expect(r.averageViewDurationSeconds).toBe(25.5);
    expect(r.subscribersGained).toBe(7);
    expect(r.impressions).toBe(8000);
    expect(r.ctrPct).toBe(4.2);
  });

  it('fetchRetentionReport requests both watch-ratio + relativeRetentionPerformance and returns the curve', async () => {
    let requestedMetrics: string | null = null;
    globalThis.fetch = vi.fn(async (url: URL | string) => {
      requestedMetrics = new URL(String(url)).searchParams.get('metrics');
      return new Response(JSON.stringify({
        columnHeaders: [
          { name: 'elapsedVideoTimeRatio' }, { name: 'audienceWatchRatio' }, { name: 'relativeRetentionPerformance' },
        ],
        rows: [[0, 1.0, 0.6], [0.1, 0.9, 0.55], [0.5, 0.5, 0.4]],
      }), { status: 200 });
    }) as never;
    const r = await fetchRetentionReport({
      accessToken: 'AT', externalChannelId: 'UC', externalVideoId: 'EXT',
      startDate: '2026-05-13', endDate: '2026-05-27',
    });
    expect(requestedMetrics).toBe('audienceWatchRatio,relativeRetentionPerformance');
    expect(r).toEqual([
      { elapsedVideoTimeRatio: 0, audienceWatchRatio: 1.0, relativeRetentionPerformance: 0.6 },
      { elapsedVideoTimeRatio: 0.1, audienceWatchRatio: 0.9, relativeRetentionPerformance: 0.55 },
      { elapsedVideoTimeRatio: 0.5, audienceWatchRatio: 0.5, relativeRetentionPerformance: 0.4 },
    ]);
  });

  it('fetchRetentionReport tolerates a curve with no relative column (older/low-data videos)', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({
        columnHeaders: [{ name: 'elapsedVideoTimeRatio' }, { name: 'audienceWatchRatio' }],
        rows: [[0, 1.0], [0.5, 0.5]],
      }), { status: 200 }),
    ) as never;
    const r = await fetchRetentionReport({
      accessToken: 'AT', externalChannelId: 'UC', externalVideoId: 'EXT',
      startDate: '2026-05-13', endDate: '2026-05-27',
    });
    expect(r).toEqual([
      { elapsedVideoTimeRatio: 0, audienceWatchRatio: 1.0, relativeRetentionPerformance: null },
      { elapsedVideoTimeRatio: 0.5, audienceWatchRatio: 0.5, relativeRetentionPerformance: null },
    ]);
  });
});
