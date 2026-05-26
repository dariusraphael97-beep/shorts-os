import type { RedditPost } from "@/lib/clients/reddit";

export interface RedditClipDiscoveryChannelRow {
  channelId: string;
  nicheId: string;
  nicheSlug: string;
  subreddits: string[];
  nicheTagVocabulary: string[];
  maxClipIngestPerDay: number;
}

export interface RedditClipDiscoveryRepo {
  listActiveChannelsWithNiches(): Promise<RedditClipDiscoveryChannelRow[]>;
  countTodayClipIngestJobs(args: { channelId: string }): Promise<number>;
  loadBlocklistForPlatform(platform: "reddit"): Promise<{
    subreddits: Set<string>; authors: Set<string>;
  }>;
  isSourceUrlIngested(sourceUrl: string): Promise<boolean>;
  logIngestSkip(args: {
    sourcePlatform: string; sourceUrl: string;
    stage1Score: number; reasoning: string;
  }): Promise<void>;
  enqueueClipIngestJob(args: {
    sourceUrl: string;
    sourceCreator: string | null;
    nicheId: string;
    channelId: string;
    postMetadata: RedditPost;
  }): Promise<{ id: string }>;
}

export interface RedditClipDiscoveryClient {
  getTopPosts(
    subreddit: string,
    opts?: { period?: "hour" | "day" | "week" | "month" | "year" | "all"; limit?: number },
  ): Promise<RedditPost[]>;
}

export interface RedditClipDiscoveryScorer {
  score(input: {
    title: string;
    subreddit: string;
    author: string;
    score: number;
    numComments: number;
    nicheSlug: string;
    nicheTagVocabulary: string[];
  }): Promise<{ stage_1_score: number; reasoning: string; suggested_tags: string[] }>;
}

export interface RedditClipDiscoveryResult {
  scraper: "reddit-clip-discovery";
  at: string;
  channelsProcessed: number;
  channelsAtCap: number;
  enqueued: number;
  skipped: number;
}

const VIDEO_URL_PATTERNS = [
  /v\.redd\.it/i,
  /youtube\.com\/shorts\//i,
  /youtu\.be\//i,
  /tiktok\.com\/@[^/]+\/video\//i,
];

function looksLikeVideo(post: RedditPost): boolean {
  if (post.isVideo) return true;
  return VIDEO_URL_PATTERNS.some((re) => re.test(post.url));
}

export async function runRedditClipDiscovery(deps: {
  client: RedditClipDiscoveryClient;
  repo: RedditClipDiscoveryRepo;
  scorer: RedditClipDiscoveryScorer;
  stage1Threshold: number;
  now: Date;
}): Promise<RedditClipDiscoveryResult> {
  const channels = await deps.repo.listActiveChannelsWithNiches();
  const blocklist = await deps.repo.loadBlocklistForPlatform("reddit");

  let enqueued = 0;
  let skipped = 0;
  let channelsAtCap = 0;

  for (const ch of channels) {
    const todayCount = await deps.repo.countTodayClipIngestJobs({ channelId: ch.channelId });
    let remaining = ch.maxClipIngestPerDay - todayCount;
    if (remaining <= 0) {
      channelsAtCap += 1;
      continue;
    }

    for (const sub of ch.subreddits) {
      if (remaining <= 0) break;
      let posts: RedditPost[];
      try {
        posts = await deps.client.getTopPosts(sub, { period: "day", limit: 25 });
      } catch (err) {
        console.warn(`reddit-clip-discovery: getTopPosts ${sub} failed:`, err);
        continue;
      }

      for (const post of posts) {
        if (remaining <= 0) break;
        if (!looksLikeVideo(post)) { skipped += 1; continue; }
        if (blocklist.subreddits.has(post.subreddit.toLowerCase())) { skipped += 1; continue; }
        if (blocklist.authors.has(post.author.toLowerCase())) { skipped += 1; continue; }
        if (await deps.repo.isSourceUrlIngested(post.url)) { skipped += 1; continue; }

        let scored: Awaited<ReturnType<RedditClipDiscoveryScorer["score"]>>;
        try {
          scored = await deps.scorer.score({
            title: post.title,
            subreddit: post.subreddit,
            author: post.author,
            score: post.score,
            numComments: post.numComments,
            nicheSlug: ch.nicheSlug,
            nicheTagVocabulary: ch.nicheTagVocabulary,
          });
        } catch (err) {
          console.warn(`reddit-clip-discovery: scorer failed for ${post.url}`, err);
          skipped += 1;
          continue;
        }

        if (scored.stage_1_score < deps.stage1Threshold) {
          await deps.repo.logIngestSkip({
            sourcePlatform: "reddit",
            sourceUrl: post.url,
            stage1Score: scored.stage_1_score,
            reasoning: scored.reasoning,
          });
          skipped += 1;
          continue;
        }

        try {
          await deps.repo.enqueueClipIngestJob({
            sourceUrl: post.url,
            sourceCreator: post.author ? `u/${post.author}` : null,
            nicheId: ch.nicheId,
            channelId: ch.channelId,
            postMetadata: post,
          });
          enqueued += 1;
          remaining -= 1;
        } catch (err) {
          console.warn(`reddit-clip-discovery: enqueue failed for ${post.url}`, err);
          skipped += 1;
        }
      }
    }
  }

  return {
    scraper: "reddit-clip-discovery",
    at: deps.now.toISOString(),
    channelsProcessed: channels.length,
    channelsAtCap,
    enqueued,
    skipped,
  };
}
