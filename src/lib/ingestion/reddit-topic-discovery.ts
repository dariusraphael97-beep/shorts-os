import 'server-only';
import type { RedditPost } from '@/lib/clients/reddit';
import type { AdapterResult } from '@/lib/ingestion/run';

export interface RedditTopicClient {
  getTopPosts(subreddit: string, options?: { period?: 'week'; limit?: number }): Promise<RedditPost[]>;
}

export interface RedditTopicRepo {
  upsertObservation(params: {
    videoId: string; source: 'reddit_topic'; channelId: null; title: string;
    description: string | null; publishedAt: Date | null; viewCount: number; likeCount: number; commentCount: number;
  }): Promise<void>;
}

export async function runRedditTopicDiscovery(args: {
  client: RedditTopicClient;
  repo: RedditTopicRepo;
  subreddits: string[];
}): Promise<AdapterResult> {
  const { client, repo, subreddits } = args;
  let ingested = 0;
  let skipped = 0;
  let failedSubs = 0;

  for (const sub of subreddits) {
    try {
      const posts = await client.getTopPosts(sub, { period: 'week', limit: 25 });
      for (const p of posts) {
        if (!p.title) { skipped++; continue; }
        await repo.upsertObservation({
          videoId: `reddit:${p.id}`, source: 'reddit_topic', channelId: null, title: p.title,
          description: p.selftext ? p.selftext.slice(0, 2000) : null,
          publishedAt: p.createdUtc ? new Date(p.createdUtc * 1000) : null,
          viewCount: p.score, likeCount: 0, commentCount: p.numComments,
        });
        ingested++;
      }
    } catch {
      failedSubs++;
    }
  }
  return { ingested, skipped, quotaUnits: 0, partial: failedSubs > 0, context: { failedSubs } };
}
