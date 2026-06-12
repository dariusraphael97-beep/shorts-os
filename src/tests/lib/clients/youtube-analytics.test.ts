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

  it('fetchCoreReport falls back to core metrics when the API rejects impressions/ctrPct', async () => {
    const requested: string[] = [];
    globalThis.fetch = vi.fn(async (url: URL | string) => {
      const metrics = new URL(String(url)).searchParams.get('metrics')!;
      requested.push(metrics);
      if (metrics.includes('impressions')) {
        return new Response(JSON.stringify({ error: { code: 400, message: 'unknown metric: impressions' } }), { status: 400 });
      }
      return new Response(JSON.stringify({ rows: [[400, 25.5, 7]] }), { status: 200 });
    }) as never;
    const r = await fetchCoreReport({
      accessToken: 'AT',
      externalChannelId: 'UC_X', externalVideoId: 'EXT_ID',
      startDate: '2026-05-13', endDate: '2026-05-27',
    });
    expect(requested.length).toBe(2);                 // tried full set, then fell back
    expect(requested[0]).toContain('impressions');
    expect(requested[1]).not.toContain('impressions');
    expect(r.estimatedMinutesWatched).toBe(400);
    expect(r.averageViewDurationSeconds).toBe(25.5);
    expect(r.subscribersGained).toBe(7);
    expect(r.impressions).toBeNull();
    expect(r.ctrPct).toBeNull();
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

  it('fetchRetentionReport falls back to audienceWatchRatio-only when relativeRetentionPerformance is rejected', async () => {
    // YouTube 400s the combined query for low-traffic videos because relativeRetentionPerformance
    // needs a minimum amount of data. The watch-ratio-only curve is still available, so we must
    // retry rather than throw away the whole curve (and, with Promise.all upstream, the whole sync).
    const requested: string[] = [];
    globalThis.fetch = vi.fn(async (url: URL | string) => {
      const metrics = new URL(String(url)).searchParams.get('metrics')!;
      requested.push(metrics);
      if (metrics.includes('relativeRetentionPerformance')) {
        return new Response(JSON.stringify({ error: { code: 400, message: 'unsupported metric: relativeRetentionPerformance' } }), { status: 400 });
      }
      return new Response(JSON.stringify({
        columnHeaders: [{ name: 'elapsedVideoTimeRatio' }, { name: 'audienceWatchRatio' }],
        rows: [[0, 1.0], [0.5, 0.5]],
      }), { status: 200 });
    }) as never;
    const r = await fetchRetentionReport({
      accessToken: 'AT', externalChannelId: 'UC', externalVideoId: 'EXT',
      startDate: '2026-05-13', endDate: '2026-05-27',
    });
    expect(requested.length).toBe(2);                            // tried combined, then fell back
    expect(requested[0]).toContain('relativeRetentionPerformance');
    expect(requested[1]).toBe('audienceWatchRatio');
    expect(r).toEqual([
      { elapsedVideoTimeRatio: 0, audienceWatchRatio: 1.0, relativeRetentionPerformance: null },
      { elapsedVideoTimeRatio: 0.5, audienceWatchRatio: 0.5, relativeRetentionPerformance: null },
    ]);
  });

  it('fetchRetentionReport returns an empty curve (never throws) when YouTube rejects the report entirely', async () => {
    // A brand-new / tiny-audience video has no retention report at all. This must degrade to [] so
    // the per-video sync still writes core stats (views/AVD/impressions/CTR) instead of silently
    // skipping the whole row via the route's Promise.all.
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: 400, message: 'insufficient data' } }), { status: 400 }),
    ) as never;
    const r = await fetchRetentionReport({
      accessToken: 'AT', externalChannelId: 'UC', externalVideoId: 'EXT',
      startDate: '2026-05-13', endDate: '2026-05-27',
    });
    expect(r).toEqual([]);
  });
});
