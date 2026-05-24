import { describe, it, expect, vi, afterEach } from "vitest";
import fixture from "@/tests/fixtures/youtube-trending.json" with { type: "json" };
import { searchShortsByQuery, parseISODurationToSeconds } from "@/lib/clients/youtube";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseISODurationToSeconds", () => {
  it("parses PT47S as 47", () => {
    expect(parseISODurationToSeconds("PT47S")).toBe(47);
  });
  it("parses PT1M5S as 65", () => {
    expect(parseISODurationToSeconds("PT1M5S")).toBe(65);
  });
  it("parses PT0S as 0", () => {
    expect(parseISODurationToSeconds("PT0S")).toBe(0);
  });
});

describe("searchShortsByQuery", () => {
  it("transforms YouTube API response into normalized shape", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ items: [{ id: { videoId: "abc123" } }] }),
          { status: 200 },
        ) as Response,
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(fixture), { status: 200 }) as Response,
      );

    const results = await searchShortsByQuery({
      query: "weird history",
      apiKey: "test-key",
      maxResults: 10,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      externalId: "abc123",
      title: "Wild fact about volcanoes",
      channelId: "UCxxx",
      channelName: "FactBlast",
      views: 1820000,
      likes: 98000,
      comments: 1200,
      durationSeconds: 47,
    });
  });
});
