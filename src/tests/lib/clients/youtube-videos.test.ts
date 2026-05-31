import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  fetchVideosByIds,
  fetchMostPopularByCategory,
  YOUTUBE_QUOTA_COST,
} from '@/lib/clients/youtube';

afterEach(() => vi.restoreAllMocks());

const videoItem = {
  id: 'vid1',
  snippet: {
    title: 'Wild fact',
    description: 'a description',
    channelId: 'UCabc',
    channelTitle: 'FactBlast',
    publishedAt: '2026-05-20T00:00:00Z',
    tags: ['facts', 'history'],
    thumbnails: { medium: { url: 'https://i.ytimg.com/vi/vid1/mq.jpg' } },
  },
  statistics: { viewCount: '1000', likeCount: '50', commentCount: '4' },
  contentDetails: { duration: 'PT45S' },
};

describe('fetchVideosByIds', () => {
  it('maps videos.list items and batches ≤50 ids per call', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [videoItem] }), { status: 200 }) as Response)
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [videoItem] }), { status: 200 }) as Response);
    const ids = Array.from({ length: 75 }, (_, i) => `v${i}`);
    const result = await fetchVideosByIds({ apiKey: 'k', videoIds: ids });
    expect(fetchMock).toHaveBeenCalledTimes(2); // 75 → 50 + 25
    expect(result[0]).toMatchObject({
      videoId: 'vid1', title: 'Wild fact', description: 'a description',
      channelId: 'UCabc', views: 1000, likes: 50, comments: 4, durationSeconds: 45,
      tags: ['facts', 'history'], thumbnailUrl: 'https://i.ytimg.com/vi/vid1/mq.jpg',
    });
  });

  it('returns [] for empty input without calling fetch', async () => {
    const fetchMock = vi.spyOn(global, 'fetch');
    expect(await fetchVideosByIds({ apiKey: 'k', videoIds: [] })).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('fetchMostPopularByCategory', () => {
  it('requests chart=mostPopular for the category and maps items', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [videoItem] }), { status: 200 }) as Response,
    );
    const result = await fetchMostPopularByCategory({ apiKey: 'k', categoryId: '24' });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('chart=mostPopular');
    expect(url).toContain('videoCategoryId=24');
    expect(result).toHaveLength(1);
  });
});

describe('YOUTUBE_QUOTA_COST', () => {
  it('encodes documented unit costs', () => {
    expect(YOUTUBE_QUOTA_COST.search).toBe(100);
    expect(YOUTUBE_QUOTA_COST.videosList).toBe(1);
    expect(YOUTUBE_QUOTA_COST.channelsList).toBe(1);
    expect(YOUTUBE_QUOTA_COST.playlistItems).toBe(1);
  });
});
