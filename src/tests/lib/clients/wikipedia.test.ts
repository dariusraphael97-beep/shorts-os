import { describe, it, expect, vi, afterEach } from "vitest";
import fixture from "@/tests/fixtures/wikipedia-random.json" with { type: "json" };
import { fetchRandomArticles } from "@/lib/clients/wikipedia";

afterEach(() => vi.restoreAllMocks());

describe("fetchRandomArticles", () => {
  it("returns normalized articles", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(fixture), { status: 200 }) as Response,
    );
    const articles = await fetchRandomArticles({ count: 2 });
    expect(articles).toHaveLength(2);
    expect(articles[0].title).toBe("Eiffel Tower");
    expect(articles[0].pageId).toBe(1);
    expect(articles[0].url).toBe("https://en.wikipedia.org/?curid=1");
    expect(articles[1].title).toBe("Mount Vesuvius");
  });
});
