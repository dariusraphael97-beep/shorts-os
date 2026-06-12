// src/lib/research/web-search.ts
// Best-effort web text search for grounding longform narration in real facts.
// Mirrors the defensive style of scripts/render-worker/lib/image-search.ts: reads
// SERPER_API_KEY straight from process.env (not in the validated env schema), and
// returns [] on ANY failure so callers never have to handle errors.

export interface SearchResult {
  title: string;
  snippet: string;
  link: string;
}

// Serper.dev — POST /search with X-API-KEY → { organic: [{ title, snippet, link }] }.
export async function webSearch(query: string, num = 6): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { organic?: Array<{ title?: string; snippet?: string; link?: string }> };
    return (j.organic ?? [])
      .filter((o): o is { title: string; snippet: string; link: string } =>
        typeof o.title === "string" && typeof o.snippet === "string" && typeof o.link === "string")
      .map((o) => ({ title: o.title, snippet: o.snippet, link: o.link }));
  } catch {
    return [];
  }
}
