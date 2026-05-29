import 'server-only';
import { YOUTUBE_QUOTA_COST, type YouTubeVideoDetail } from '@/lib/clients/youtube';
import type { YouTubeCategory } from '@/lib/ingestion/config';
import type { AdapterResult } from '@/lib/ingestion/run';

export interface CategorySweepClient {
  fetchMostPopularByCategory(params: { apiKey: string; categoryId: string; regionCode?: string; maxResults?: number }): Promise<YouTubeVideoDetail[]>;
}

export interface CategorySweepRepo {
  upsertObservation(params: {
    videoId: string; source: 'youtube_most_popular'; channelId: string | null;
    title: string; description: string | null; tags: unknown[]; thumbnailUrl: string | null;
    durationSeconds: number | null; publishedAt: Date | null; viewCount: number; likeCount: number; commentCount: number;
  }): Promise<void>;
}

export async function runCategorySweep(args: {
  client: CategorySweepClient;
  repo: CategorySweepRepo;
  categories: YouTubeCategory[];
  apiKey: string;
}): Promise<AdapterResult> {
  const { client, repo, categories, apiKey } = args;
  let ingested = 0;
  let skipped = 0;
  let quotaUnits = 0;
  let failedCategories = 0;

  for (const category of categories) {
    try {
      const videos = await client.fetchMostPopularByCategory({ apiKey, categoryId: category.id, regionCode: 'US', maxResults: 50 });
      quotaUnits += YOUTUBE_QUOTA_COST.videosList;
      for (const v of videos) {
        if (v.durationSeconds > 60 || v.durationSeconds <= 0) { skipped++; continue; }
        await repo.upsertObservation({
          videoId: v.videoId, source: 'youtube_most_popular', channelId: v.channelId || null,
          title: v.title, description: v.description || null, tags: v.tags, thumbnailUrl: v.thumbnailUrl,
          durationSeconds: v.durationSeconds, publishedAt: v.publishedAt ? new Date(v.publishedAt) : null,
          viewCount: v.views, likeCount: v.likes, commentCount: v.comments,
        });
        ingested++;
      }
    } catch {
      failedCategories++;
    }
  }
  return { ingested, skipped, quotaUnits, partial: failedCategories > 0, context: { failedCategories } };
}
