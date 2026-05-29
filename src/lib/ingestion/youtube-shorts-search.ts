import 'server-only';
import { YOUTUBE_QUOTA_COST, type YouTubeShortResult } from '@/lib/clients/youtube';
import type { AdapterResult } from '@/lib/ingestion/run';

export interface ShortsSearchClient {
  searchShortsByQuery(params: { query: string; apiKey: string; maxResults?: number }): Promise<YouTubeShortResult[]>;
}

export interface ShortsSearchRepo {
  upsertObservation(params: {
    videoId: string; source: 'youtube_search'; channelId: string | null;
    title: string; durationSeconds: number | null; publishedAt: Date | null;
    viewCount: number; likeCount: number; commentCount: number;
  }): Promise<void>;
}

export async function runShortsSearch(args: {
  client: ShortsSearchClient;
  repo: ShortsSearchRepo;
  seeds: string[];
  apiKey: string;
}): Promise<AdapterResult> {
  const { client, repo, seeds, apiKey } = args;
  let ingested = 0;
  let skipped = 0;
  let quotaUnits = 0;
  let failedSeeds = 0;

  for (const seed of seeds) {
    try {
      const results = await client.searchShortsByQuery({ query: seed, apiKey, maxResults: 25 });
      quotaUnits += YOUTUBE_QUOTA_COST.search;
      for (const r of results) {
        if (r.durationSeconds > 60 || r.durationSeconds <= 0) { skipped++; continue; }
        await repo.upsertObservation({
          videoId: r.externalId, source: 'youtube_search', channelId: r.channelId || null,
          title: r.title, durationSeconds: r.durationSeconds,
          publishedAt: r.publishedAt ? new Date(r.publishedAt) : null,
          viewCount: r.views, likeCount: r.likes, commentCount: r.comments,
        });
        ingested++;
      }
    } catch {
      failedSeeds++;
    }
  }
  return { ingested, skipped, quotaUnits, partial: failedSeeds > 0, context: { failedSeeds } };
}
