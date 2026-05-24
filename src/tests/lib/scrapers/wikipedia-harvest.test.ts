import { describe, it, expect, vi, beforeEach } from "vitest";
import { runWikipediaHarvest } from "@/lib/scrapers/wikipedia-harvest";

const mockClient = {
  fetchRandomArticles: vi.fn(),
  fetchArticleExtract: vi.fn(),
};

const mockRepo = {
  getActiveNiches: vi.fn(),
  queueTopicCandidates: vi.fn(),
};

beforeEach(() => {
  mockClient.fetchRandomArticles.mockReset();
  mockClient.fetchArticleExtract.mockReset();
  mockRepo.getActiveNiches.mockReset();
  mockRepo.queueTopicCandidates.mockReset();
});

describe("runWikipediaHarvest", () => {
  it("fetches random articles and queues them for active niches", async () => {
    mockClient.fetchRandomArticles.mockResolvedValue([
      { pageId: 1, title: "Eiffel Tower", url: "u1", rawPayload: { id: 1 } },
      { pageId: 2, title: "Vesuvius", url: "u2", rawPayload: { id: 2 } },
    ]);
    mockClient.fetchArticleExtract.mockResolvedValue("an extract");
    mockRepo.getActiveNiches.mockResolvedValue([{ id: "n1" }]);
    mockRepo.queueTopicCandidates.mockResolvedValue({ inserted: 2 });

    const result = await runWikipediaHarvest({
      client: mockClient,
      repo: mockRepo,
      perNicheCount: 2,
    });

    expect(mockClient.fetchRandomArticles).toHaveBeenCalledWith({ count: 2 });
    expect(mockClient.fetchArticleExtract).toHaveBeenCalledTimes(2);
    expect(mockRepo.queueTopicCandidates).toHaveBeenCalledOnce();
    expect(result.totalQueued).toBe(2);
    expect(result.nichesProcessed).toBe(1);
  });

  it("returns 0 when no niches active", async () => {
    mockRepo.getActiveNiches.mockResolvedValue([]);
    const result = await runWikipediaHarvest({
      client: mockClient,
      repo: mockRepo,
    });
    expect(result.totalQueued).toBe(0);
    expect(result.nichesProcessed).toBe(0);
    expect(mockClient.fetchRandomArticles).not.toHaveBeenCalled();
  });

  it("passes title + extract summary in queued rows", async () => {
    mockClient.fetchRandomArticles.mockResolvedValue([
      { pageId: 42, title: "Cool Topic", url: "u", rawPayload: { id: 42 } },
    ]);
    mockClient.fetchArticleExtract.mockResolvedValue("the extract body");
    mockRepo.getActiveNiches.mockResolvedValue([{ id: "n1" }]);
    mockRepo.queueTopicCandidates.mockResolvedValue({ inserted: 1 });

    await runWikipediaHarvest({
      client: mockClient,
      repo: mockRepo,
      perNicheCount: 1,
    });

    const rows = mockRepo.queueTopicCandidates.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      niche_id: "n1",
      source: "wikipedia",
      external_ref: "42",
      title: "Cool Topic",
      summary: "the extract body",
    });
  });
});
