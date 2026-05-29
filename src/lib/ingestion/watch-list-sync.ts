import 'server-only';
import { YOUTUBE_QUOTA_COST, type YouTubeChannel, type YouTubeVideoDetail } from '@/lib/clients/youtube';
import type { AdapterResult } from '@/lib/ingestion/run';
import {
  computeUploadCadencePerWeek, computeAvgViews, computeOutlierRate,
  computeGrowthFraction, evaluateAutoAdd,
} from '@/lib/ingestion/watch-list-math';

const ACTIVE_CHANNEL_CAP = 1000;
const MS_PER_DAY = 86_400_000;

export interface WatchListSyncClient {
  fetchChannels(params: { apiKey: string; channelIds: string[] }): Promise<YouTubeChannel[]>;
  fetchPlaylistItems(params: { apiKey: string; playlistId: string; maxResults?: number }): Promise<Array<{ videoId: string; publishedAt: string }>>;
  fetchVideosByIds(params: { apiKey: string; videoIds: string[] }): Promise<YouTubeVideoDetail[]>;
}

export interface WatchListSyncRepo {
  insertVelocitySnapshot(params: { videoId: string; viewCount: number; likeCount: number; commentCount: number }): Promise<void>;
  upsertObservation(params: {
    videoId: string; source: 'youtube_watch_list'; channelId: string | null; channelSubscriberCount: number | null;
    title: string; description: string | null; tags: unknown[]; thumbnailUrl: string | null;
    durationSeconds: number | null; publishedAt: Date | null; viewCount: number; likeCount: number; commentCount: number;
  }): Promise<void>;
  insertChannelStatSnapshot(params: { channelId: string; subscriberCount: number; videoCount: number | null; viewCount: number | null }): Promise<void>;
  getSnapshotNearestTo(params: { channelId: string; targetDate: Date }): Promise<{ subscriber_count: number } | null>;
  updateWatchedChannelSnapshot(params: {
    channelId: string; currentSubscriberCount: number; subscriberGrowth30d: number | null;
    subscriberGrowth90d: number | null; outlierRate60d: number | null; uploadCadencePerWeek: number | null; lastSnapshottedAt: Date;
  }): Promise<void>;
  listRecentObservationChannelIds(params: { sinceHours: number }): Promise<string[]>;
  isWatched(channelId: string): Promise<boolean>;
  countActive(): Promise<number>;
  upsertWatchedChannel(params: {
    channelId: string; channelHandle: string | null; channelTitle: string | null; channelThumbnailUrl: string | null;
    subscriberCountAtAdd: number; currentSubscriberCount: number; uploadCadencePerWeek: number; outlierRate60d: number;
    discoverySource: 'auto_outlier' | 'auto_breakout';
  }): Promise<void>;
  evictInactive(cutoff: Date): Promise<number>;
}

export interface ActiveChannelRow {
  channel_id: string;
  uploads_playlist_id: string | null;
}

async function channelRecentVideos(
  client: WatchListSyncClient, apiKey: string, uploadsPlaylistId: string,
): Promise<{ videos: YouTubeVideoDetail[]; quota: number }> {
  const items = await client.fetchPlaylistItems({ apiKey, playlistId: uploadsPlaylistId, maxResults: 30 });
  let quota = YOUTUBE_QUOTA_COST.playlistItems;
  if (items.length === 0) return { videos: [], quota };
  const videos = await client.fetchVideosByIds({ apiKey, videoIds: items.map((i) => i.videoId) });
  quota += Math.ceil(items.length / 50) * YOUTUBE_QUOTA_COST.videosList;
  return { videos, quota };
}

export async function runWatchListSync(args: {
  client: WatchListSyncClient;
  repo: WatchListSyncRepo;
  activeChannels: ActiveChannelRow[];
  apiKey: string;
  now?: Date;
}): Promise<AdapterResult> {
  const { client, repo, activeChannels, apiKey } = args;
  const now = args.now ?? new Date();
  let ingested = 0;
  let skipped = 0;
  let quotaUnits = 0;
  let failures = 0;

  // Phase 1: velocity snapshots (recent uploads, last 7d) for active channels.
  const sevenDaysAgo = now.getTime() - 7 * MS_PER_DAY;
  for (const ch of activeChannels) {
    if (!ch.uploads_playlist_id) { skipped++; continue; }
    try {
      const { videos, quota } = await channelRecentVideos(client, apiKey, ch.uploads_playlist_id);
      quotaUnits += quota;
      for (const v of videos) {
        const published = v.publishedAt ? new Date(v.publishedAt).getTime() : 0;
        if (published < sevenDaysAgo) continue;
        await repo.insertVelocitySnapshot({ videoId: v.videoId, viewCount: v.views, likeCount: v.likes, commentCount: v.comments });
        await repo.upsertObservation({
          videoId: v.videoId, source: 'youtube_watch_list', channelId: v.channelId || null, channelSubscriberCount: null,
          title: v.title, description: v.description || null, tags: v.tags, thumbnailUrl: v.thumbnailUrl,
          durationSeconds: v.durationSeconds, publishedAt: v.publishedAt ? new Date(v.publishedAt) : null,
          viewCount: v.views, likeCount: v.likes, commentCount: v.comments,
        });
        ingested++;
      }
    } catch { failures++; }
  }

  // Phase 2: channel-stat enrichment for active channels.
  try {
    const channels = await client.fetchChannels({ apiKey, channelIds: activeChannels.map((c) => c.channel_id) });
    quotaUnits += Math.ceil(activeChannels.length / 50) * YOUTUBE_QUOTA_COST.channelsList;
    for (const c of channels) {
      try {
        await repo.insertChannelStatSnapshot({ channelId: c.channelId, subscriberCount: c.subscriberCount, videoCount: c.videoCount, viewCount: c.viewCount });
        const snap30 = await repo.getSnapshotNearestTo({ channelId: c.channelId, targetDate: new Date(now.getTime() - 30 * MS_PER_DAY) });
        const snap90 = await repo.getSnapshotNearestTo({ channelId: c.channelId, targetDate: new Date(now.getTime() - 90 * MS_PER_DAY) });
        let outlierRate60d: number | null = null;
        let cadence: number | null = null;
        if (c.uploadsPlaylistId) {
          try {
            const { videos, quota } = await channelRecentVideos(client, apiKey, c.uploadsPlaylistId);
            quotaUnits += quota;
            const avg = computeAvgViews(videos.map((v) => v.views));
            outlierRate60d = computeOutlierRate(videos.map((v) => v.views), avg, 3);
            cadence = computeUploadCadencePerWeek(videos.map((v) => new Date(v.publishedAt)), 30, now);
          } catch { failures++; }
        }
        await repo.updateWatchedChannelSnapshot({
          channelId: c.channelId, currentSubscriberCount: c.subscriberCount,
          subscriberGrowth30d: computeGrowthFraction(c.subscriberCount, snap30?.subscriber_count ?? null),
          subscriberGrowth90d: computeGrowthFraction(c.subscriberCount, snap90?.subscriber_count ?? null),
          outlierRate60d, uploadCadencePerWeek: cadence, lastSnapshottedAt: now,
        });
      } catch { failures++; }
    }
  } catch { failures++; }

  // Phase 3: auto-discovery of newly-observed channels.
  try {
    const candidateIds = await repo.listRecentObservationChannelIds({ sinceHours: 48 });
    for (const channelId of candidateIds) {
      try {
        if (await repo.isWatched(channelId)) continue;
        const [channel] = await client.fetchChannels({ apiKey, channelIds: [channelId] });
        quotaUnits += YOUTUBE_QUOTA_COST.channelsList;
        if (!channel) { skipped++; continue; }
        let outlierRate = 0;
        let cadence = 0;
        if (channel.uploadsPlaylistId) {
          const { videos, quota } = await channelRecentVideos(client, apiKey, channel.uploadsPlaylistId);
          quotaUnits += quota;
          const avg = computeAvgViews(videos.map((v) => v.views));
          outlierRate = computeOutlierRate(videos.map((v) => v.views), avg, 3);
          cadence = computeUploadCadencePerWeek(videos.map((v) => new Date(v.publishedAt)), 30, now);
        }
        const snap30 = await repo.getSnapshotNearestTo({ channelId, targetDate: new Date(now.getTime() - 30 * MS_PER_DAY) });
        const atCap = (await repo.countActive()) >= ACTIVE_CHANNEL_CAP;
        const decision = evaluateAutoAdd({
          subscriberCount: channel.subscriberCount, uploadCadencePerWeek: cadence, outlierRate,
          subs30dAgo: snap30?.subscriber_count ?? null, atCap,
        });
        if (decision.add && decision.source) {
          await repo.upsertWatchedChannel({
            channelId, channelHandle: channel.handle, channelTitle: channel.title, channelThumbnailUrl: channel.thumbnailUrl,
            subscriberCountAtAdd: channel.subscriberCount, currentSubscriberCount: channel.subscriberCount,
            uploadCadencePerWeek: cadence, outlierRate60d: outlierRate, discoverySource: decision.source,
          });
        }
      } catch { failures++; }
    }
  } catch { failures++; }

  // Phase 4: evict channels stale >90d.
  try {
    await repo.evictInactive(new Date(now.getTime() - 90 * MS_PER_DAY));
  } catch { failures++; }

  return { ingested, skipped, quotaUnits, partial: failures > 0, context: { failures } };
}
