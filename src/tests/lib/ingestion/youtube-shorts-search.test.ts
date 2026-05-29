import { describe, it, expect, vi } from 'vitest';
import { runShortsSearch } from '@/lib/ingestion/youtube-shorts-search';
import type { YouTubeShortResult } from '@/lib/clients/youtube';

function shortResult(id: string): YouTubeShortResult {
  return {
    externalId: id, title: `t${id}`, channelId: `UC${id}`, channelName: 'c',
    publishedAt: '2026-05-20T00:00:00Z', views: 500, likes: 10, comments: 2,
    durationSeconds: 30, url: `https://youtube.com/shorts/${id}`, rawPayload: {},
  };
}

describe('runShortsSearch', () => {
  it('searches each seed and upserts observations', async () => {
    const upserts: string[] = [];
    const client = { searchShortsByQuery: vi.fn(async () => [shortResult('a'), shortResult('b')]) };
    const repo = { upsertObservation: vi.fn(async (p: { videoId: string }) => { upserts.push(p.videoId); }) };
    const result = await runShortsSearch({ client, repo, seeds: ['weird history'], apiKey: 'k' });
    expect(upserts).toEqual(['a', 'b']);
    expect(result.ingested).toBe(2);
    expect(result.quotaUnits).toBe(100); // 1 seed × search cost
  });

  it('marks partial when one seed fails', async () => {
    const client = {
      searchShortsByQuery: vi.fn().mockResolvedValueOnce([shortResult('a')]).mockRejectedValueOnce(new Error('quota')),
    };
    const repo = { upsertObservation: vi.fn(async () => {}) };
    const result = await runShortsSearch({ client, repo, seeds: ['s1', 's2'], apiKey: 'k' });
    expect(result.ingested).toBe(1);
    expect(result.partial).toBe(true);
  });
});
