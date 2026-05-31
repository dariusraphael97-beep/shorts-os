export interface DigestClusterRow {
  id: string; canonical_topic: string; format_label: string; niche_score: number | null;
  proven_score: number | null; first_mover_score: number | null; channel_count: number;
  avg_views: number | null; production_fit: string; discovery_state: string;
  digest_rank: number | null; example_video_ids: string[];
}
export interface DigestNiche {
  id: string; topic: string; format: string; band: "proven" | "unproven";
  channelCount: number; avgViews: number | null; productionFit: string; thumbnailId: string | null;
}
export interface DigestEmailProps { weekStart: string; hero: DigestNiche | null; rest: DigestNiche[] }

function toNiche(r: DigestClusterRow): DigestNiche {
  return {
    id: r.id, topic: r.canonical_topic, format: r.format_label,
    band: (r.proven_score ?? 0) > 0.6 ? "proven" : "unproven",
    channelCount: r.channel_count, avgViews: r.avg_views, productionFit: r.production_fit,
    thumbnailId: r.example_video_ids[0] ?? null,
  };
}

export function buildEmailProps(weekStart: string, rows: DigestClusterRow[]): DigestEmailProps {
  const ranked = [...rows].filter((r) => r.digest_rank !== null).sort((a, b) => (a.digest_rank! - b.digest_rank!));
  if (ranked.length === 0) return { weekStart, hero: null, rest: [] };
  return { weekStart, hero: toNiche(ranked[0]), rest: ranked.slice(1).map(toNiche) };
}
