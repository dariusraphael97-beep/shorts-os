import { describe, it, expect, vi, afterEach } from "vitest";
import feedFixture from "@/tests/fixtures/tikapi-trending.json" with { type: "json" };
import { searchTrendingByHashtag } from "@/lib/clients/tikapi";

afterEach(() => vi.restoreAllMocks());

describe("searchTrendingByHashtag", () => {
  it("performs the two-call hashtag lookup + feed flow and normalizes results", async () => {
    const lookup = {
      challengeInfo: { challenge: { id: "183145" } },
      status: "success",
    };
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(lookup), { status: 200 }) as Response,
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(feedFixture), { status: 200 }) as Response,
      );

    const results = await searchTrendingByHashtag({
      hashtag: "historyfacts",
      apiKey: "k",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const firstUrl = String(fetchSpy.mock.calls[0][0]);
    const secondUrl = String(fetchSpy.mock.calls[1][0]);
    expect(firstUrl).toContain("name=historyfacts");
    expect(secondUrl).toContain("id=183145");
    expect(secondUrl).toContain("count=30");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      externalId: "tt1",
      title: expect.stringContaining("volcanoes"),
      views: 1500000,
      durationSeconds: 47,
    });
  });

  it("returns empty when hashtag lookup has no challenge id", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ challengeInfo: {} }), {
        status: 200,
      }) as Response,
    );
    const results = await searchTrendingByHashtag({
      hashtag: "doesnotexist",
      apiKey: "k",
    });
    expect(results).toEqual([]);
  });
});
