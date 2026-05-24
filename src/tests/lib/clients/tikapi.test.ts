import { describe, it, expect, vi, afterEach } from "vitest";
import fixture from "@/tests/fixtures/tikapi-trending.json" with { type: "json" };
import { searchTrendingByHashtag } from "@/lib/clients/tikapi";

afterEach(() => vi.restoreAllMocks());

describe("searchTrendingByHashtag", () => {
  it("normalizes TikAPI response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(fixture), { status: 200 }) as Response,
    );
    const results = await searchTrendingByHashtag({
      hashtag: "historyfacts",
      apiKey: "k",
    });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      externalId: "tt1",
      title: expect.stringContaining("volcanoes"),
      views: 1500000,
      durationSeconds: 47,
    });
  });
});
