import type { YouTubeShortResult } from "@/lib/clients/youtube";

export type YouTubeViralObservationRow = {
  niche_id: string;
  source: "youtube";
  external_id: string;
  url: string;
  title: string;
  views: number;
  likes: number;
  comments: number;
  duration_seconds: number;
  channel_id: string;
  channel_name: string;
  views_at_observation: number;
  raw_payload: unknown;
};

export type YouTubeTrendingDeps = {
  client: {
    searchShortsByQuery: (params: {
      query: string;
      apiKey: string;
      maxResults?: number;
    }) => Promise<YouTubeShortResult[]>;
  };
  repo: {
    getActiveNiches: () => Promise<
      Array<{ id: string; slug: string; youtube_search_terms: string[] }>
    >;
    recordViralObservations: (
      observations: YouTubeViralObservationRow[],
    ) => Promise<{ inserted: number }>;
  };
  apiKey: string;
};

export async function runYouTubeTrendingScrape(deps: YouTubeTrendingDeps) {
  const niches = await deps.repo.getActiveNiches();
  let totalObserved = 0;

  for (const niche of niches) {
    const all: YouTubeShortResult[] = [];
    for (const term of niche.youtube_search_terms ?? []) {
      const items = await deps.client.searchShortsByQuery({
        query: term,
        apiKey: deps.apiKey,
        maxResults: 25,
      });
      all.push(...items);
    }

    if (all.length === 0) continue;

    const rows: YouTubeViralObservationRow[] = all.map((it) => ({
      niche_id: niche.id,
      source: "youtube",
      external_id: it.externalId,
      url: it.url,
      title: it.title,
      views: it.views,
      likes: it.likes,
      comments: it.comments,
      duration_seconds: it.durationSeconds,
      channel_id: it.channelId,
      channel_name: it.channelName,
      views_at_observation: it.views,
      raw_payload: it.rawPayload,
    }));

    const result = await deps.repo.recordViralObservations(rows);
    totalObserved += result.inserted;
  }

  return { nichesProcessed: niches.length, totalObserved };
}
