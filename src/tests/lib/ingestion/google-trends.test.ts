import { describe, it, expect, vi } from 'vitest';
import { runGoogleTrends, parseFormattedTraffic } from '@/lib/ingestion/google-trends';

describe('parseFormattedTraffic', () => {
  it('parses K/M suffixes', () => {
    expect(parseFormattedTraffic('200K+')).toBe(200000);
    expect(parseFormattedTraffic('1M+')).toBe(1000000);
    expect(parseFormattedTraffic('500+')).toBe(500);
    expect(parseFormattedTraffic('')).toBe(0);
  });
});

describe('runGoogleTrends', () => {
  it('upserts a synthetic trends observation per trending search', async () => {
    const upserts: Array<{ videoId: string; source: string; title: string; viewCount: number }> = [];
    const client = {
      dailyTrends: vi.fn(async () => [
        { title: 'Volcano eruption', traffic: '200K+', relatedQueries: ['lava', 'iceland'] },
      ]),
    };
    const repo = { upsertObservation: vi.fn(async (p: { videoId: string; source: string; title: string; viewCount: number }) => { upserts.push(p); }) };
    const result = await runGoogleTrends({ client, repo, geo: 'US' });
    expect(upserts[0]).toMatchObject({ videoId: 'gtrends:US:volcano-eruption', source: 'google_trends', title: 'Volcano eruption', viewCount: 200000 });
    expect(result.ingested).toBe(1);
  });

  it('marks an unreachable source as skipped (not failed) when the client throws', async () => {
    // Google Trends is a best-effort, no-official-API source; an unreachable scrape must not
    // red-flag the Niche Scout agent — it records as 'skipped' with a traceable reason.
    const client = { dailyTrends: vi.fn(async () => { throw new Error('scraper broke'); }) };
    const repo = { upsertObservation: vi.fn(async () => {}) };
    const result = await runGoogleTrends({ client, repo, geo: 'US' });
    expect(result.status).toBe('skipped');
    expect(result.context).toMatchObject({ reason: 'source_unavailable' });
    expect(result.ingested).toBe(0);
  });
});
