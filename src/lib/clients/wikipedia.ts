export type WikipediaArticle = {
  pageId: number;
  title: string;
  url: string;
  extract?: string;
  rawPayload: unknown;
};

export async function fetchRandomArticles(params: {
  count: number;
}): Promise<WikipediaArticle[]> {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("list", "random");
  url.searchParams.set("rnnamespace", "0");
  url.searchParams.set("rnlimit", String(params.count));
  url.searchParams.set("origin", "*");
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Wikipedia random failed: ${res.status}`);
  const j = (await res.json()) as {
    query: { random: Array<{ id: number; title: string }> };
  };
  return j.query.random.map((r) => ({
    pageId: r.id,
    title: r.title,
    url: `https://en.wikipedia.org/?curid=${r.id}`,
    rawPayload: r,
  }));
}

export async function fetchArticleExtract(
  pageId: number,
): Promise<string | undefined> {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("prop", "extracts");
  url.searchParams.set("exintro", "true");
  url.searchParams.set("explaintext", "true");
  url.searchParams.set("pageids", String(pageId));
  url.searchParams.set("origin", "*");
  const res = await fetch(url.toString());
  if (!res.ok) return undefined;
  const j = (await res.json()) as {
    query: { pages: Record<string, { extract?: string }> };
  };
  return j.query.pages[String(pageId)]?.extract;
}
