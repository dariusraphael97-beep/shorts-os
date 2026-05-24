import type { RedditPost } from "@/lib/clients/reddit";
import { scraperLog } from "@/lib/scrapers/shared";

export type RedditTopicRow = {
  niche_id: string;
  source: "reddit";
  external_ref: string;
  title: string;
  summary: string | null;
  raw_payload: unknown;
};

export type RedditHarvestRepo = {
  listActiveNiches(): Promise<Array<{ id: string; subreddits: string[] }>>;
  insertTopics(
    rows: RedditTopicRow[],
  ): Promise<{ inserted: number }>;
};

export type RedditHarvestClient = {
  getTopPosts(
    subreddit: string,
    opts?: {
      period?: "hour" | "day" | "week" | "month" | "year" | "all";
      limit?: number;
    },
  ): Promise<RedditPost[]>;
};

export type RedditHarvestResult = {
  scraper: "reddit-harvest";
  at: string;
  nichesProcessed: number;
  totalQueued: number;
};

export async function runRedditHarvest(deps: {
  client: RedditHarvestClient;
  repo: RedditHarvestRepo;
}): Promise<RedditHarvestResult> {
  const niches = await deps.repo.listActiveNiches();
  const seen = new Set<string>();
  const rows: RedditTopicRow[] = [];

  for (const niche of niches) {
    for (const sub of niche.subreddits ?? []) {
      try {
        const posts = await deps.client.getTopPosts(sub, {
          period: "day",
          limit: 10,
        });
        for (const post of posts) {
          const externalRef = `t3_${post.id}`;
          if (seen.has(externalRef)) continue;
          seen.add(externalRef);
          const summary = post.selftext?.trim()
            ? post.selftext.slice(0, 500)
            : null;
          rows.push({
            niche_id: niche.id,
            source: "reddit",
            external_ref: externalRef,
            title: post.title,
            summary,
            raw_payload: post,
          });
        }
      } catch (e) {
        console.warn(
          scraperLog("reddit-harvest", {
            level: "warn",
            niche_id: niche.id,
            subreddit: sub,
            error: e instanceof Error ? e.message : String(e),
          }),
        );
      }
    }
  }

  let inserted = 0;
  if (rows.length > 0) {
    const r = await deps.repo.insertTopics(rows);
    inserted = r.inserted;
  }

  return {
    scraper: "reddit-harvest",
    at: new Date().toISOString(),
    nichesProcessed: niches.length,
    totalQueued: inserted,
  };
}
