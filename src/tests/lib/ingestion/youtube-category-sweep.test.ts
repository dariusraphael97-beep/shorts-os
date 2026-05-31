import { describe, it, expect, vi } from 'vitest';
import { runCategorySweep } from '@/lib/ingestion/youtube-category-sweep';
import type { YouTubeVideoDetail } from '@/lib/clients/youtube';

function vid(id: string, duration: number): YouTubeVideoDetail {
  return {
    videoId: id, title: `t${id}`, description: 'd', tags: [], channelId: `UC${id}`,
    channelTitle: 'c', publishedAt: '2026-05-20T00:00:00Z', views: 100, likes: 1,
    comments: 0, durationSeconds: duration, thumbnailUrl: null,
  };
}

describe('runCategorySweep', () => {
  it('ingests ≤60s videos and skips longer ones', async () => {
    const upserts: string[] = [];
    const client = { fetchMostPopularByCategory: vi.fn(async () => [vid('a', 45), vid('b', 120)]) };
    const repo = { upsertObservation: vi.fn(async (p: { videoId: string }) => { upserts.push(p.videoId); }) };
    const result = await runCategorySweep({ client, repo, categories: [{ id: '24', label: 'Entertainment' }], apiKey: 'k' });
    expect(upserts).toEqual(['a']);
    expect(result.ingested).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.quotaUnits).toBe(1); // 1 category × videosList cost
  });

  it('marks partial when a category fetch throws but others succeed', async () => {
    const client = {
      fetchMostPopularByCategory: vi.fn()
        .mockResolvedValueOnce([vid('a', 30)])
        .mockRejectedValueOnce(new Error('quota')),
    };
    const repo = { upsertObservation: vi.fn(async () => {}) };
    const result = await runCategorySweep({
      client, repo,
      categories: [{ id: '24', label: 'E' }, { id: '23', label: 'C' }], apiKey: 'k',
    });
    expect(result.ingested).toBe(1);
    expect(result.partial).toBe(true);
  });
});
