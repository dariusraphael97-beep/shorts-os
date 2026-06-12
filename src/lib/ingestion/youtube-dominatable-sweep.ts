import 'server-only';
import { YOUTUBE_QUOTA_COST, type YouTubeVideoDetail, type YouTubeChannel } from '@/lib/clients/youtube';
import { DOMINATABLE_GATE } from '@/lib/ingestion/config';
import type { AdapterResult } from '@/lib/ingestion/run';

export interface DominatableSweepClient {
  searchVideoIds(p: { query: string; apiKey: string; videoDuration?: 'medium' | 'long'; order?: 'viewCount'; publishedAfter?: string; maxResults?: number }): Promise<string[]>;
  fetchVideosByIds(p: { videoIds: string[]; apiKey: string }): Promise<YouTubeVideoDetail[]>;
  fetchChannels(p: { channelIds: string[]; apiKey: string }): Promise<YouTubeChannel[]>;
}

export interface DominatableSweepRepo {
  upsertObservation(p: {
    videoId: string; source: 'youtube_dominatable'; channelId: string | null;
    channelSubscriberCount: number | null; channelPublishedAt: Date | null;
    title: string; description: string | null; tags: unknown[]; thumbnailUrl: string | null;
    durationSeconds: number | null; publishedAt: Date | null; viewCount: number; likeCount: number; commentCount: number;
  }): Promise<void>;
}

function channelAgeDays(publishedAt: string | null, now: Date): number | null {
  if (!publishedAt) return null;
  return (now.getTime() - new Date(publishedAt).getTime()) / 86_400_000;
}

export async function runDominatableSweep(args: {
  client: DominatableSweepClient; repo: DominatableSweepRepo;
  seeds: readonly string[]; apiKey: string; now: Date;
}): Promise<AdapterResult> {
  const { client, repo, seeds, apiKey, now } = args;
  const publishedAfter = new Date(now.getTime() - DOMINATABLE_GATE.publishedWithinDays * 86_400_000).toISOString();
  let ingested = 0, skipped = 0, quotaUnits = 0, failedSeeds = 0;

  for (const seed of seeds) {
    try {
      quotaUnits += YOUTUBE_QUOTA_COST.search;   // search.list quota is spent on issue, even if it then throws
      const ids = await client.searchVideoIds({ query: seed, apiKey, videoDuration: 'medium', order: 'viewCount', publishedAfter, maxResults: 50 });
      if (ids.length === 0) continue;
      const videos = await client.fetchVideosByIds({ videoIds: ids, apiKey });
      quotaUnits += YOUTUBE_QUOTA_COST.videosList;
      const channelIds = [...new Set(videos.map((v) => v.channelId).filter((c): c is string => !!c))];
      const channels = await client.fetchChannels({ channelIds, apiKey });
      quotaUnits += YOUTUBE_QUOTA_COST.channelsList * Math.ceil(channelIds.length / 50); // 0 when no channel ids (fetchChannels makes no request)
      const byChannel = new Map(channels.map((c) => [c.channelId, c]));

      for (const v of videos) {
        const ch = v.channelId ? byChannel.get(v.channelId) : undefined;
        const ageDays = channelAgeDays(ch?.publishedAt ?? null, now);
        const ratio = ch && ch.subscriberCount > 0 ? v.views / ch.subscriberCount : Infinity;
        const ok = ch
          && v.durationSeconds >= DOMINATABLE_GATE.minDurationSeconds
          && v.views >= DOMINATABLE_GATE.minViews
          && ratio >= DOMINATABLE_GATE.minViewsToSubsRatio
          && ageDays !== null && ageDays <= DOMINATABLE_GATE.maxChannelAgeDays;
        if (!ok) { skipped++; continue; }
        await repo.upsertObservation({
          videoId: v.videoId, source: 'youtube_dominatable', channelId: v.channelId || null,
          channelSubscriberCount: ch.subscriberCount, channelPublishedAt: ch.publishedAt ? new Date(ch.publishedAt) : null,
          title: v.title, description: v.description || null, tags: v.tags, thumbnailUrl: v.thumbnailUrl,
          durationSeconds: v.durationSeconds, publishedAt: v.publishedAt ? new Date(v.publishedAt) : null,
          viewCount: v.views, likeCount: v.likes, commentCount: v.comments,
        });
        ingested++;
      }
    } catch {
      failedSeeds++;
    }
  }
  return { ingested, skipped, quotaUnits, partial: failedSeeds > 0, context: { failedSeeds } };
}
