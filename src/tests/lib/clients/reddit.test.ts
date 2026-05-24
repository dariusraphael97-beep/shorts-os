import { describe, it, expect, vi, afterEach } from "vitest";
import fixture from "@/tests/fixtures/reddit-listing.json" with { type: "json" };
import { getTopPosts } from "@/lib/clients/reddit";

afterEach(() => vi.restoreAllMocks());

describe("getTopPosts", () => {
  it("calls the correct URL with default period/limit and User-Agent header", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(fixture), { status: 200 }) as Response,
      );

    await getTopPosts("todayilearned");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://www.reddit.com/r/todayilearned/top.json?t=day&limit=25",
    );
    const headers = init?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toMatch(/shorts-os/);
  });

  it("honors explicit period and limit and encodes the subreddit name", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(fixture), { status: 200 }) as Response,
      );

    await getTopPosts("AskReddit", { period: "week", limit: 5 });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://www.reddit.com/r/AskReddit/top.json?t=week&limit=5",
    );
  });

  it("parses the listing and filters stickied, NSFW, and deleted posts", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(fixture), { status: 200 }) as Response,
    );

    const posts = await getTopPosts("todayilearned");

    // Fixture has 5 children; 3 should be filtered (stickied r2, nsfw r3, deleted r4).
    expect(posts).toHaveLength(2);
    expect(posts.map((p) => p.id)).toEqual(["r1", "r5"]);
    expect(posts[0]).toMatchObject({
      id: "r1",
      subreddit: "todayilearned",
      title: "TIL the Eiffel Tower can grow 6 inches in summer",
      selftext: "Heat expands the metal, causing the tower to grow taller.",
      author: "curious_user",
      score: 12500,
      numComments: 320,
      createdUtc: 1716508800,
      upvoteRatio: 0.97,
      isSelf: true,
      isVideo: false,
      flair: null,
    });
    expect(posts[0].permalink).toContain("/r/todayilearned/");
  });

  it("respects the REDDIT_USER_AGENT env override when set", async () => {
    const original = process.env.REDDIT_USER_AGENT;
    process.env.REDDIT_USER_AGENT = "custom-agent/9.9";
    try {
      const fetchMock = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(
          new Response(JSON.stringify(fixture), { status: 200 }) as Response,
        );

      await getTopPosts("todayilearned");

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = init?.headers as Record<string, string>;
      expect(headers["User-Agent"]).toBe("custom-agent/9.9");
    } finally {
      if (original === undefined) delete process.env.REDDIT_USER_AGENT;
      else process.env.REDDIT_USER_AGENT = original;
    }
  });

  it("throws on a non-OK response (after retries)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("forbidden", { status: 403 }) as Response,
    );

    await expect(getTopPosts("todayilearned")).rejects.toThrow(
      /Reddit 403 for r\/todayilearned/,
    );
  });
});
