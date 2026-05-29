import { describe, it, expect, vi } from 'vitest';
import { runWatchListSync, type WatchListSyncClient, type WatchListSyncRepo } from '@/lib/ingestion/watch-list-sync';

const now = new Date('2026-05-28T00:00:00Z');

function baseDeps() {
  return {
    apiKey: 'k',
    now,
    activeChannels: [{ channel_id: 'UC1', uploads_playlist_id: 'UU1' }],
    client: {
      fetchChannels: vi.fn(async () => [{ channelId: 'UC1', title: 'C1', handle: '@c1', thumbnailUrl: null, subscriberCount: 50000, videoCount: 100, viewCount: 1_000_000, uploadsPlaylistId: 'UU1' }]),
      fetchPlaylistItems: vi.fn(async () => [{ videoId: 'v1', publishedAt: '2026-05-27T00:00:00Z' }]),
      fetchVideosByIds: vi.fn(async () => [{ videoId: 'v1', title: 'V1', description: 'd', tags: [], channelId: 'UC1', channelTitle: 'C1', publishedAt: '2026-05-27T00:00:00Z', views: 9000, likes: 10, comments: 1, durationSeconds: 40, thumbnailUrl: null }]),
    } as unknown as WatchListSyncClient,
    repo: {
      insertVelocitySnapshot: vi.fn(async () => {}),
      upsertObservation: vi.fn(async () => {}),
      insertChannelStatSnapshot: vi.fn(async () => {}),
      getSnapshotNearestTo: vi.fn(async () => null),
      updateWatchedChannelSnapshot: vi.fn(async () => {}),
      listRecentObservationChannelIds: vi.fn(async () => ['UC2']),
      isWatched: vi.fn(async () => false),
      countActive: vi.fn(async () => 5),
      upsertWatchedChannel: vi.fn(async () => {}),
      evictInactive: vi.fn(async () => 0),
    } as unknown as WatchListSyncRepo,
  };
}

describe('runWatchListSync', () => {
  it('snapshots velocity, enriches stats, and reports counts', async () => {
    const deps = baseDeps();
    const result = await runWatchListSync(deps);
    expect(deps.repo.insertVelocitySnapshot).toHaveBeenCalledWith(expect.objectContaining({ videoId: 'v1', viewCount: 9000 }));
    expect(deps.repo.insertChannelStatSnapshot).toHaveBeenCalledWith(expect.objectContaining({ channelId: 'UC1', subscriberCount: 50000 }));
    expect(deps.repo.updateWatchedChannelSnapshot).toHaveBeenCalled();
    expect(result.ingested).toBeGreaterThanOrEqual(1);
  });

  it('auto-adds a qualifying newly-observed channel', async () => {
    const deps = baseDeps();
    deps.client.fetchChannels = vi.fn(async (p: { channelIds: string[] }) => p.channelIds.map((id) => ({
      channelId: id, title: id, handle: null, thumbnailUrl: null, subscriberCount: 50000, videoCount: 30, viewCount: 500000, uploadsPlaylistId: `UU_${id}`,
    })));
    deps.client.fetchPlaylistItems = vi.fn(async () => Array.from({ length: 8 }, (_, i) => ({ videoId: `nv${i}`, publishedAt: '2026-05-25T00:00:00Z' })));
    deps.client.fetchVideosByIds = vi.fn(async (p: { videoIds: string[] }) => p.videoIds.map((id, i) => ({
      videoId: id, title: id, description: '', tags: [], channelId: 'UC2', channelTitle: 'UC2', publishedAt: '2026-05-25T00:00:00Z',
      views: i === 0 ? 100000 : 1000, likes: 0, comments: 0, durationSeconds: 30, thumbnailUrl: null,
    })));
    await runWatchListSync(deps);
    expect(deps.repo.upsertWatchedChannel).toHaveBeenCalledWith(expect.objectContaining({ channelId: 'UC2', discoverySource: 'auto_outlier' }));
  });

  it('still enriches when velocity for one channel throws (partial)', async () => {
    const deps = baseDeps();
    deps.client.fetchPlaylistItems = vi.fn(async () => { throw new Error('quota'); });
    const result = await runWatchListSync(deps);
    expect(result.partial).toBe(true);
    expect(deps.repo.insertChannelStatSnapshot).toHaveBeenCalled(); // enrichment still ran
  });
});
