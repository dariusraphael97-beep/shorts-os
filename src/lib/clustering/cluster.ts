import type { FormatLabel, AudienceSignal } from "@/lib/supabase/repositories/shorts-classifications";
import type { ShortsObservationSource } from "@/lib/supabase/repositories/shorts-observations";
import { formatToProductionFit, type ProductionFit } from "@/lib/classifier/taxonomy";

export interface ClusterInputRow {
  video_id: string;
  source: ShortsObservationSource;
  channel_id: string | null;
  channel_subscriber_count: number | null;
  description: string | null;
  topic_label: string;
  format_label: FormatLabel;
  audience_signal: AudienceSignal | string | null;
  view_count: number;
  published_at: string | null;
  observed_at: string;
}

export interface BuiltCluster {
  canonicalTopic: string;
  formatLabel: FormatLabel;
  rows: ClusterInputRow[];
  exampleVideoIds: string[];
  channelCount: number;
  avgViews: number;
  firstSeenAt: string | null;
  productionFit: ProductionFit;
  discoveryState: "pre_public" | "public";
  audienceSignal: string | null;
}

const BROAD_PUBLIC: ReadonlySet<ShortsObservationSource> = new Set(["youtube_most_popular", "google_trends", "youtube_dominatable"]);
const MIN_CLUSTER_SIZE = 3;

function modal(values: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null, bestN = 0;
  for (const [v, n] of counts) if (n > bestN) { best = v; bestN = n; }
  return best;
}

export function buildClusters(rows: ClusterInputRow[], canonical: Map<string, string>): BuiltCluster[] {
  const groups = new Map<string, { canon: string; format: FormatLabel; rows: ClusterInputRow[] }>();
  for (const r of rows) {
    const canon = canonical.get(r.topic_label) ?? r.topic_label;
    const key = `${canon}\t${r.format_label}`;
    const g = groups.get(key) ?? { canon, format: r.format_label, rows: [] };
    g.rows.push(r);
    groups.set(key, g);
  }
  const clusters: BuiltCluster[] = [];
  for (const g of groups.values()) {
    if (g.rows.length < MIN_CLUSTER_SIZE) continue;
    const channelIds = new Set(g.rows.map((r) => r.channel_id).filter((c): c is string => !!c));
    const sorted = [...g.rows].sort((a, b) => b.view_count - a.view_count);
    const times = g.rows.map((r) => r.published_at ?? r.observed_at).filter(Boolean).sort();
    clusters.push({
      canonicalTopic: g.canon,
      formatLabel: g.format,
      rows: g.rows,
      exampleVideoIds: sorted.slice(0, 5).map((r) => r.video_id),
      channelCount: channelIds.size,
      avgViews: Math.round(g.rows.reduce((s, r) => s + r.view_count, 0) / g.rows.length),
      firstSeenAt: times[0] ?? null,
      productionFit: formatToProductionFit(g.format),
      discoveryState: g.rows.some((r) => BROAD_PUBLIC.has(r.source)) ? "public" : "pre_public",
      audienceSignal: modal(g.rows.map((r) => (r.audience_signal as string | null) ?? null)),
    });
  }
  return clusters;
}
