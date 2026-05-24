import type { TikTokVideo } from "@/lib/clients/tikapi";

export type TikTokViralObservationRow = {
  niche_id: string;
  source: "tiktok";
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

export type TikTokTrendingDeps = {
  client: {
    searchTrendingByHashtag: (p: {
      hashtag: string;
      apiKey: string;
      count?: number;
    }) => Promise<TikTokVideo[]>;
  };
  repo: {
    getActiveNiches: () => Promise<
      Array<{ id: string; tiktok_hashtags: string[] }>
    >;
    recordViralObservations: (
      rows: TikTokViralObservationRow[],
    ) => Promise<{ inserted: number }>;
  };
  apiKey: string;
};

export async function runTikTokTrendingScrape(deps: TikTokTrendingDeps) {
  const niches = await deps.repo.getActiveNiches();
  let totalObserved = 0;

  for (const niche of niches) {
    const all: TikTokVideo[] = [];
    for (const tag of niche.tiktok_hashtags ?? []) {
      const items = await deps.client.searchTrendingByHashtag({
        hashtag: tag,
        apiKey: deps.apiKey,
        count: 30,
      });
      all.push(...items);
    }
    if (all.length === 0) continue;

    // Dedupe by externalId (see youtube-trending.ts for rationale —
    // viral_observations unique key (source, external_id, observed_at)
    // collides on duplicates within a single batch).
    const seen = new Set<string>();
    const unique = all.filter((it) => {
      if (!it.externalId || seen.has(it.externalId)) return false;
      seen.add(it.externalId);
      return true;
    });

    const rows: TikTokViralObservationRow[] = unique.map((it: TikTokVideo) => ({
      niche_id: niche.id,
      source: "tiktok",
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

    const r = await deps.repo.recordViralObservations(rows);
    totalObserved += r.inserted;
  }

  return { nichesProcessed: niches.length, totalObserved };
}
