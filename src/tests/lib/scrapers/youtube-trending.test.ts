import { describe, it, expect, vi, beforeEach } from "vitest";
import { runYouTubeTrendingScrape } from "@/lib/scrapers/youtube-trending";

const mockClient = {
  searchShortsByQuery: vi.fn(),
};

const mockRepo = {
  getActiveNiches: vi.fn(),
  recordViralObservations: vi.fn(),
};

beforeEach(() => {
  mockClient.searchShortsByQuery.mockReset();
  mockRepo.getActiveNiches.mockReset();
  mockRepo.recordViralObservations.mockReset();
});

describe("runYouTubeTrendingScrape", () => {
  it("scrapes each active niche's search terms and writes observations", async () => {
    mockRepo.getActiveNiches.mockResolvedValue([
      {
        id: "n1",
        slug: "wikipedia-til",
        youtube_search_terms: ["weird history", "wild fact"],
      },
    ]);
    mockClient.searchShortsByQuery
      .mockResolvedValueOnce([
        {
          externalId: "v1",
          views: 1000,
          likes: 0,
          comments: 0,
          durationSeconds: 30,
          title: "x",
          url: "u",
          channelId: "c",
          channelName: "n",
          publishedAt: "2026-05-01",
          rawPayload: {},
        },
      ])
      .mockResolvedValueOnce([
        {
          externalId: "v2",
          views: 2000,
          likes: 0,
          comments: 0,
          durationSeconds: 30,
          title: "y",
          url: "u",
          channelId: "c",
          channelName: "n",
          publishedAt: "2026-05-01",
          rawPayload: {},
        },
      ]);
    mockRepo.recordViralObservations.mockResolvedValue({ inserted: 2 });

    const result = await runYouTubeTrendingScrape({
      client: mockClient,
      repo: mockRepo,
      apiKey: "test",
    });

    expect(mockClient.searchShortsByQuery).toHaveBeenCalledTimes(2);
    expect(mockRepo.recordViralObservations).toHaveBeenCalledOnce();
    expect(result.totalObserved).toBe(2);
    expect(result.nichesProcessed).toBe(1);
  });

  it("returns gracefully when no niches active", async () => {
    mockRepo.getActiveNiches.mockResolvedValue([]);
    const result = await runYouTubeTrendingScrape({
      client: mockClient,
      repo: mockRepo,
      apiKey: "test",
    });
    expect(result.totalObserved).toBe(0);
    expect(result.nichesProcessed).toBe(0);
  });
});
