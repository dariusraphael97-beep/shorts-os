import type { WikipediaArticle } from "@/lib/clients/wikipedia";

export type WikipediaTopicRow = {
  niche_id: string;
  source: "wikipedia";
  external_ref: string;
  title: string;
  summary: string;
  raw_payload: unknown;
};

export type WikipediaHarvestDeps = {
  client: {
    fetchRandomArticles: (p: { count: number }) => Promise<WikipediaArticle[]>;
    fetchArticleExtract: (pageId: number) => Promise<string | undefined>;
  };
  repo: {
    getActiveNiches: () => Promise<Array<{ id: string }>>;
    queueTopicCandidates: (
      rows: WikipediaTopicRow[],
    ) => Promise<{ inserted: number }>;
  };
  perNicheCount?: number;
};

export async function runWikipediaHarvest(deps: WikipediaHarvestDeps) {
  const niches = await deps.repo.getActiveNiches();
  const perNiche = deps.perNicheCount ?? 10;
  let totalQueued = 0;

  for (const niche of niches) {
    const articles = await deps.client.fetchRandomArticles({ count: perNiche });
    if (articles.length === 0) continue;

    const extracts = await Promise.all(
      articles.map((a) => deps.client.fetchArticleExtract(a.pageId)),
    );

    const rows: WikipediaTopicRow[] = articles.map((a, i) => ({
      niche_id: niche.id,
      source: "wikipedia",
      external_ref: String(a.pageId),
      title: a.title,
      summary: extracts[i]?.slice(0, 1500) ?? "",
      raw_payload: a.rawPayload,
    }));

    const r = await deps.repo.queueTopicCandidates(rows);
    totalQueued += r.inserted;
  }

  return { nichesProcessed: niches.length, totalQueued };
}
