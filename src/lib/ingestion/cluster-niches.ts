import "server-only";
import type { AdapterResult } from "@/lib/ingestion/run";
import type { ClassifiedObservation } from "@/lib/supabase/repositories/shorts-observations";
import type { NicheClusterInsert } from "@/lib/supabase/repositories/niche-clusters";
import type { FormatLabel } from "@/lib/supabase/repositories/shorts-classifications";
import { fuzzyMergeTopics } from "@/lib/clustering/cosine";
import { buildClusters, type ClusterInputRow } from "@/lib/clustering/cluster";
import { computeComponents } from "@/lib/scoring/components";
import { computeNicheScore } from "@/lib/scoring/score";
import { selectDigest, type ScoredCandidate } from "@/lib/scoring/select";

export interface RunClusteringArgs {
  since: Date;
  weekStart: string;
  minConfidence: number;
  mergeThreshold: number;
  now: Date;
  fetchRows: () => Promise<ClassifiedObservation[]>;
  getCachedEmbeddings: (labels: string[]) => Promise<Map<string, number[]>>;
  embed: (labels: string[]) => Promise<number[][]>;
  saveEmbeddings: (rows: Array<{ topicLabel: string; embedding: number[] }>) => Promise<void>;
  replaceWeek: (weekStart: string, rows: NicheClusterInsert[]) => Promise<number>;
}

function toClusterRow(o: ClassifiedObservation): ClusterInputRow {
  return {
    video_id: o.video_id, source: o.source, channel_id: o.channel_id,
    channel_subscriber_count: o.channel_subscriber_count, channel_published_at: o.channel_published_at,
    description: o.description,
    topic_label: o.topic_label, format_label: o.format_label as FormatLabel,
    audience_signal: o.audience_signal, view_count: o.view_count,
    published_at: o.published_at, observed_at: o.observed_at,
  };
}

export async function runClustering(args: RunClusteringArgs): Promise<AdapterResult> {
  const rows = await args.fetchRows();
  if (rows.length === 0) {
    await args.replaceWeek(args.weekStart, []);
    return { ingested: 0, skipped: 0, quotaUnits: 0, context: { clusters: 0, selected: 0 } };
  }

  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.topic_label, (counts.get(r.topic_label) ?? 0) + 1);
  const labels = [...counts.keys()];

  const embeddings = await args.getCachedEmbeddings(labels);
  const misses = labels.filter((l) => !embeddings.has(l));
  if (misses.length > 0) {
    const vectors = await args.embed(misses);
    const toSave: Array<{ topicLabel: string; embedding: number[] }> = [];
    misses.forEach((label, i) => {
      const v = vectors[i];
      if (v) { embeddings.set(label, v); toSave.push({ topicLabel: label, embedding: v }); }
    });
    await args.saveEmbeddings(toSave);
  }

  const canonical = fuzzyMergeTopics(labels, embeddings, counts, args.mergeThreshold);
  const clusters = buildClusters(rows.map(toClusterRow), canonical);

  const scored = clusters.map((cluster, i) => {
    const { components, explain } = computeComponents(cluster, args.now);
    const { score, contributions } = computeNicheScore(components);
    const canonEmb = embeddings.get(cluster.canonicalTopic) ?? [0];
    return { i, cluster, components, explain, score, contributions, canonEmb };
  });

  const candidates: ScoredCandidate[] = scored.map((s) => ({
    id: String(s.i), nicheScore: s.score, provenScore: s.components.provenScore,
    firstMoverScore: s.components.firstMoverScore, embedding: s.canonEmb,
  }));
  const ranked = selectDigest(candidates, { provenTarget: 5, unprovenTarget: 3, lambda: 0.7 });
  const rankById = new Map(ranked.map((r) => [r.id, r.digestRank]));

  const inserts: NicheClusterInsert[] = scored.map((s) => ({
    weekStart: args.weekStart,
    canonicalTopic: s.cluster.canonicalTopic,
    formatLabel: s.cluster.formatLabel,
    exampleVideoIds: s.cluster.exampleVideoIds,
    channelCount: s.cluster.channelCount,
    avgViews: s.cluster.avgViews,
    avgVelocity24h: null,
    outlierDensity: s.components.outlierDensity,
    firstSeenAt: s.cluster.firstSeenAt,
    firstMoverScore: s.components.firstMoverScore,
    provenScore: s.components.provenScore,
    nicheScore: s.score,
    discoveryState: s.cluster.discoveryState,
    productionFit: s.cluster.productionFit,
    audienceSignal: s.cluster.audienceSignal,
    digestRank: rankById.get(String(s.i)) ?? null,
    explainabilityTopSignals: { ...s.explain, contributions: s.contributions },
  }));

  const written = await args.replaceWeek(args.weekStart, inserts);
  return { ingested: written, skipped: 0, quotaUnits: 0, context: { clusters: clusters.length, selected: ranked.length } };
}
