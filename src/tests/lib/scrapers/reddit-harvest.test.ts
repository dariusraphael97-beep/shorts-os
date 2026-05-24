import { describe, it, expect, vi, beforeEach } from "vitest";
import { runRedditHarvest } from "@/lib/scrapers/reddit-harvest";
import type { RedditPost } from "@/lib/clients/reddit";

function fakePost(overrides: Partial<RedditPost>): RedditPost {
  return {
    id: "x",
    subreddit: "AskReddit",
    title: "fake",
    selftext: "",
    permalink: "/r/AskReddit/comments/x/",
    url: "https://reddit.com/r/AskReddit/comments/x/",
    author: "u",
    score: 1,
    numComments: 0,
    createdUtc: 0,
    upvoteRatio: 0.9,
    flair: null,
    isSelf: true,
    isVideo: false,
    ...overrides,
  };
}

const mockClient = {
  getTopPosts: vi.fn(),
};

const mockRepo = {
  listActiveNiches: vi.fn(),
  insertTopics: vi.fn(),
};

beforeEach(() => {
  mockClient.getTopPosts.mockReset();
  mockRepo.listActiveNiches.mockReset();
  mockRepo.insertTopics.mockReset();
});

describe("runRedditHarvest", () => {
  it("queues posts from every subreddit across every active niche", async () => {
    mockRepo.listActiveNiches.mockResolvedValue([
      { id: "n1", subreddits: ["singularity", "MachineLearning"] },
      { id: "n2", subreddits: ["space", "AskScience"] },
    ]);
    mockClient.getTopPosts
      .mockResolvedValueOnce([fakePost({ id: "a", title: "A" })])
      .mockResolvedValueOnce([fakePost({ id: "b", title: "B" })])
      .mockResolvedValueOnce([fakePost({ id: "c", title: "C" })])
      .mockResolvedValueOnce([fakePost({ id: "d", title: "D" })]);
    mockRepo.insertTopics.mockResolvedValue({ inserted: 4 });

    const result = await runRedditHarvest({
      client: mockClient,
      repo: mockRepo,
    });

    expect(mockClient.getTopPosts).toHaveBeenCalledTimes(4);
    expect(mockClient.getTopPosts).toHaveBeenCalledWith("singularity", {
      period: "day",
      limit: 10,
    });
    expect(mockRepo.insertTopics).toHaveBeenCalledOnce();
    const rows = mockRepo.insertTopics.mock.calls[0][0];
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      niche_id: "n1",
      source: "reddit",
      external_ref: "t3_a",
      title: "A",
    });
    expect(rows[3].niche_id).toBe("n2");
    expect(result).toMatchObject({
      scraper: "reddit-harvest",
      nichesProcessed: 2,
      totalQueued: 4,
    });
  });

  it("continues when one subreddit errors and inserts the rest", async () => {
    mockRepo.listActiveNiches.mockResolvedValue([
      { id: "n1", subreddits: ["good", "bad"] },
    ]);
    mockClient.getTopPosts
      .mockResolvedValueOnce([
        fakePost({ id: "ok1", title: "okay" }),
        fakePost({ id: "ok2", title: "another" }),
      ])
      .mockRejectedValueOnce(new Error("Reddit 429 for r/bad"));
    mockRepo.insertTopics.mockResolvedValue({ inserted: 2 });

    const result = await runRedditHarvest({
      client: mockClient,
      repo: mockRepo,
    });

    expect(mockClient.getTopPosts).toHaveBeenCalledTimes(2);
    expect(mockRepo.insertTopics).toHaveBeenCalledOnce();
    const rows = mockRepo.insertTopics.mock.calls[0][0];
    expect(rows.map((r: { external_ref: string }) => r.external_ref)).toEqual([
      "t3_ok1",
      "t3_ok2",
    ]);
    expect(result.totalQueued).toBe(2);
    expect(result.nichesProcessed).toBe(1);
  });

  it("de-dupes posts by external_ref across subreddits within a single run", async () => {
    mockRepo.listActiveNiches.mockResolvedValue([
      { id: "n1", subreddits: ["a", "b"] },
    ]);
    mockClient.getTopPosts
      .mockResolvedValueOnce([fakePost({ id: "dupe", title: "X" })])
      .mockResolvedValueOnce([
        fakePost({ id: "dupe", title: "X" }),
        fakePost({ id: "fresh", title: "Y" }),
      ]);
    mockRepo.insertTopics.mockResolvedValue({ inserted: 2 });

    const result = await runRedditHarvest({
      client: mockClient,
      repo: mockRepo,
    });

    const rows = mockRepo.insertTopics.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(
      rows.map((r: { external_ref: string }) => r.external_ref).sort(),
    ).toEqual(["t3_dupe", "t3_fresh"]);
    expect(result.totalQueued).toBe(2);
  });

  it("skips repo insert and returns zero when no posts collected", async () => {
    mockRepo.listActiveNiches.mockResolvedValue([
      { id: "n1", subreddits: ["empty"] },
    ]);
    mockClient.getTopPosts.mockResolvedValueOnce([]);

    const result = await runRedditHarvest({
      client: mockClient,
      repo: mockRepo,
    });

    expect(mockRepo.insertTopics).not.toHaveBeenCalled();
    expect(result.totalQueued).toBe(0);
    expect(result.nichesProcessed).toBe(1);
  });
});
