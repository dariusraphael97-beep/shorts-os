import { describe, it, expect, vi } from "vitest";
import { runRedditClipDiscovery } from "@/lib/scrapers/reddit-clip-discovery";
import type { RedditPost } from "@/lib/clients/reddit";

function post(overrides: Partial<RedditPost>): RedditPost {
  return {
    id: "abc", subreddit: "cars", title: "Mechanic finds rats in air filter",
    selftext: "", permalink: "/r/cars/comments/abc", url: "https://v.redd.it/xyz",
    author: "wrenchhands", score: 8000, numComments: 250, createdUtc: 1_700_000_000,
    upvoteRatio: 0.95, flair: null, isSelf: false, isVideo: true,
    ...overrides,
  };
}

describe("runRedditClipDiscovery", () => {
  it("enqueues clip_ingest for high-scoring video posts, skip-logs low scores, dedupes against blocklist + clip_library", async () => {
    const repo = {
      listActiveChannelsWithNiches: vi.fn().mockResolvedValue([
        { channelId: "ch1", nicheId: "n1", nicheSlug: "cars",
          subreddits: ["cars", "JustRolledIntoTheShop"], nicheTagVocabulary: ["mechanic_fail"],
          maxClipIngestPerDay: 10 },
      ]),
      countTodayClipIngestJobs: vi.fn().mockResolvedValue(2),
      loadBlocklistForPlatform: vi.fn().mockResolvedValue({
        subreddits: new Set(["spamsub"]), authors: new Set(["spamuser"]),
      }),
      isSourceUrlIngested: vi.fn(async (url: string) => url.includes("already")),
      logIngestSkip: vi.fn().mockResolvedValue(undefined),
      enqueueClipIngestJob: vi.fn(async () => ({ id: "job-id" })),
    };
    const client = {
      getTopPosts: vi.fn(async (sub: string) => {
        if (sub === "cars") {
          return [
            post({ id: "good", title: "Crash compilation", url: "https://v.redd.it/good" }),
            post({ id: "low",  title: "off-topic rant", url: "https://v.redd.it/low" }),
            post({ id: "dup",  title: "Already ingested", url: "https://v.redd.it/already" }),
            post({ id: "txt",  title: "Text post", url: "https://reddit.com/...", isVideo: false }),
          ];
        }
        return [];
      }),
    };
    const scorer = {
      score: vi.fn(async (i: { title: string }) =>
        i.title.includes("off-topic")
          ? { stage_1_score: 12, reasoning: "off-topic", suggested_tags: [] }
          : { stage_1_score: 81, reasoning: "viral", suggested_tags: ["mechanic_fail"] },
      ),
    };

    const result = await runRedditClipDiscovery({
      client, repo, scorer,
      stage1Threshold: 60,
      now: new Date("2026-05-26T00:00:00Z"),
    });

    expect(repo.enqueueClipIngestJob).toHaveBeenCalledTimes(1);
    expect(repo.enqueueClipIngestJob).toHaveBeenCalledWith(expect.objectContaining({
      sourceUrl: "https://v.redd.it/good",
      nicheId: "n1",
      channelId: "ch1",
    }));
    expect(repo.logIngestSkip).toHaveBeenCalledTimes(1);
    expect(result.channelsProcessed).toBe(1);
    expect(result.enqueued).toBe(1);
    expect(result.skipped).toBeGreaterThanOrEqual(2);
  });

  it("respects per-channel max_clip_ingest_per_day cap", async () => {
    const repo = {
      listActiveChannelsWithNiches: vi.fn().mockResolvedValue([
        { channelId: "ch1", nicheId: "n1", nicheSlug: "cars",
          subreddits: ["cars"], nicheTagVocabulary: [], maxClipIngestPerDay: 5 },
      ]),
      countTodayClipIngestJobs: vi.fn().mockResolvedValue(5),
      loadBlocklistForPlatform: vi.fn().mockResolvedValue({ subreddits: new Set(), authors: new Set() }),
      isSourceUrlIngested: vi.fn().mockResolvedValue(false),
      logIngestSkip: vi.fn(),
      enqueueClipIngestJob: vi.fn(),
    };
    const client = { getTopPosts: vi.fn().mockResolvedValue([]) };
    const scorer = { score: vi.fn() };
    const result = await runRedditClipDiscovery({
      client, repo, scorer, stage1Threshold: 60, now: new Date(),
    });
    expect(client.getTopPosts).not.toHaveBeenCalled();
    expect(result.enqueued).toBe(0);
    expect(result.channelsAtCap).toBe(1);
  });
});
