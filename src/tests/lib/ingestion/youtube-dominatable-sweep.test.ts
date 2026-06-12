import { describe, it, expect, vi } from 'vitest';
import { runDominatableSweep } from '@/lib/ingestion/youtube-dominatable-sweep';
import type { YouTubeVideoDetail, YouTubeChannel } from '@/lib/clients/youtube';

function vid(p: Partial<YouTubeVideoDetail>): YouTubeVideoDetail {
  return { videoId: 'v', channelId: 'c', channelTitle: '', title: 't', description: '', tags: [], thumbnailUrl: null,
    durationSeconds: 500, publishedAt: '2026-05-01T00:00:00Z', views: 1_000_000, likes: 0, comments: 0, ...p };
}
function chan(p: Partial<YouTubeChannel>): YouTubeChannel {
  return { channelId: 'c', title: '', handle: null, thumbnailUrl: null, subscriberCount: 5000,
    videoCount: 0, viewCount: 0, uploadsPlaylistId: null, publishedAt: '2026-04-01T00:00:00Z', ...p };
}

describe('runDominatableSweep', () => {
  const now = new Date('2026-06-12T00:00:00Z');

  it('ingests a qualifying longform video with subscriber count + channel age enriched', async () => {
    const upserts: any[] = [];
    const client = {
      searchVideoIds: vi.fn(async () => ['v1']),
      fetchVideosByIds: vi.fn(async () => [vid({ videoId: 'v1', channelId: 'c1', views: 1_000_000, durationSeconds: 500 })]),
      fetchChannels: vi.fn(async () => [chan({ channelId: 'c1', subscriberCount: 5000, publishedAt: '2026-05-20T00:00:00Z' })]),
    };
    const repo = { upsertObservation: vi.fn(async (p: any) => { upserts.push(p); }) };
    const res = await runDominatableSweep({ client, repo, seeds: ['birds'], apiKey: 'K', now });
    expect(res.ingested).toBe(1);
    expect(upserts[0]).toMatchObject({ source: 'youtube_dominatable', channelSubscriberCount: 5000 });
    expect(upserts[0].channelPublishedAt instanceof Date).toBe(true);
  });

  it('skips a short (<240s), a low-view, an old-channel, and a low-ratio video', async () => {
    const client = {
      searchVideoIds: vi.fn(async () => ['a', 'b', 'd', 'e']),
      fetchVideosByIds: vi.fn(async () => [
        vid({ videoId: 'a', channelId: 'ca', durationSeconds: 60 }),
        vid({ videoId: 'b', channelId: 'cb', views: 1000 }),
        vid({ videoId: 'd', channelId: 'cd', views: 1_000_000 }),
        vid({ videoId: 'e', channelId: 'ce', views: 1_000_000 }),
      ]),
      fetchChannels: vi.fn(async () => [
        chan({ channelId: 'ca', subscriberCount: 1000 }),
        chan({ channelId: 'cb', subscriberCount: 1000 }),
        chan({ channelId: 'cd', subscriberCount: 100, publishedAt: '2024-01-01T00:00:00Z' }),
        chan({ channelId: 'ce', subscriberCount: 2_000_000 }),
      ]),
    };
    const repo = { upsertObservation: vi.fn(async () => {}) };
    const res = await runDominatableSweep({ client, repo, seeds: ['x'], apiKey: 'K', now });
    expect(res.ingested).toBe(0);
    expect(res.skipped).toBe(4);
    expect(repo.upsertObservation).not.toHaveBeenCalled();
  });

  it('records quota and marks partial when a seed search fails', async () => {
    const client = {
      searchVideoIds: vi.fn(async () => { throw new Error('quota'); }),
      fetchVideosByIds: vi.fn(async () => []),
      fetchChannels: vi.fn(async () => []),
    };
    const repo = { upsertObservation: vi.fn(async () => {}) };
    const res = await runDominatableSweep({ client, repo, seeds: ['x'], apiKey: 'K', now });
    expect(res.partial).toBe(true);
    expect(res.quotaUnits).toBe(100); // search quota counted even though the search threw
  });
});
