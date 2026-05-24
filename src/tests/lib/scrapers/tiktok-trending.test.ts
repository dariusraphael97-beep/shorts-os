import { describe, it, expect, vi, beforeEach } from "vitest";
import { runTikTokTrendingScrape } from "@/lib/scrapers/tiktok-trending";

const mockClient = {
  searchTrendingByHashtag: vi.fn(),
};

const mockRepo = {
  getActiveNiches: vi.fn(),
  recordViralObservations: vi.fn(),
};

beforeEach(() => {
  mockClient.searchTrendingByHashtag.mockReset();
  mockRepo.getActiveNiches.mockReset();
  mockRepo.recordViralObservations.mockReset();
});

describe("runTikTokTrendingScrape", () => {
  it("scrapes each niche's hashtags and writes observations", async () => {
    mockClient.searchTrendingByHashtag.mockResolvedValue([
      {
        externalId: "t1",
        views: 1000,
        title: "x",
        url: "u",
        likes: 0,
        comments: 0,
        durationSeconds: 30,
        channelId: "c",
        channelName: "n",
        publishedAt: "2026-05-01",
        rawPayload: {},
      },
    ]);
    mockRepo.getActiveNiches.mockResolvedValue([
      { id: "n1", tiktok_hashtags: ["historyfacts"] },
    ]);
    mockRepo.recordViralObservations.mockResolvedValue({ inserted: 1 });

    const result = await runTikTokTrendingScrape({
      client: mockClient,
      repo: mockRepo,
      apiKey: "k",
    });

    expect(mockClient.searchTrendingByHashtag).toHaveBeenCalledOnce();
    expect(mockRepo.recordViralObservations).toHaveBeenCalledOnce();
    expect(result.totalObserved).toBe(1);
    expect(result.nichesProcessed).toBe(1);
  });

  it("returns 0 when no niches active", async () => {
    mockRepo.getActiveNiches.mockResolvedValue([]);
    const result = await runTikTokTrendingScrape({
      client: mockClient,
      repo: mockRepo,
      apiKey: "k",
    });
    expect(result.totalObserved).toBe(0);
    expect(result.nichesProcessed).toBe(0);
    expect(mockClient.searchTrendingByHashtag).not.toHaveBeenCalled();
  });
});
