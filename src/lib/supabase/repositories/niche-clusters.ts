import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FormatLabel, AudienceSignal } from './shorts-classifications';

export type DiscoveryState = 'pre_public' | 'public';
export type ProductionFit = 'native' | 'needs_manual_recording' | 'needs_manual_editing' | 'manual_only';

export interface NicheCluster {
  id: string;
  week_start: string;
  canonical_topic: string;
  format_label: FormatLabel;
  example_video_ids: string[];
  channel_count: number;
  avg_views: number | null;
  avg_velocity_24h: number | null;
  outlier_density: number | null;
  first_seen_at: string | null;
  first_mover_score: number | null;
  proven_score: number | null;
  niche_score: number | null;
  discovery_state: DiscoveryState | null;
  production_fit: ProductionFit | null;
  audience_signal: AudienceSignal | null;
  digest_rank: number | null;
  explainability_top_signals: Record<string, number>;
  created_at: string;
}

export interface InsertNicheClusterParams {
  weekStart: string;
  canonicalTopic: string;
  formatLabel: FormatLabel;
  exampleVideoIds: string[];
  channelCount: number;
  avgViews: number | null;
  avgVelocity24h: number | null;
  outlierDensity: number | null;
  firstSeenAt: Date | null;
  firstMoverScore: number | null;
  provenScore: number | null;
  nicheScore: number | null;
  discoveryState: DiscoveryState | null;
  productionFit: ProductionFit | null;
  audienceSignal: AudienceSignal | null;
  digestRank?: number | null;
  explainabilityTopSignals?: Record<string, number>;
}

export async function insertNicheCluster(
  supabase: SupabaseClient,
  params: InsertNicheClusterParams,
): Promise<NicheCluster> {
  const { data, error } = await supabase
    .from('niche_clusters')
    .insert({
      week_start: params.weekStart,
      canonical_topic: params.canonicalTopic,
      format_label: params.formatLabel,
      example_video_ids: params.exampleVideoIds,
      channel_count: params.channelCount,
      avg_views: params.avgViews,
      avg_velocity_24h: params.avgVelocity24h,
      outlier_density: params.outlierDensity,
      first_seen_at: params.firstSeenAt ? params.firstSeenAt.toISOString() : null,
      first_mover_score: params.firstMoverScore,
      proven_score: params.provenScore,
      niche_score: params.nicheScore,
      discovery_state: params.discoveryState,
      production_fit: params.productionFit,
      audience_signal: params.audienceSignal,
      digest_rank: params.digestRank ?? null,
      explainability_top_signals: params.explainabilityTopSignals ?? {},
    })
    .select()
    .single();
  if (error) throw new Error(`insertNicheCluster: ${error.message}`);
  return data as NicheCluster;
}

export async function listDigestRankedClusters(
  supabase: SupabaseClient,
  weekStart: string,
): Promise<NicheCluster[]> {
  const { data, error } = await supabase
    .from('niche_clusters')
    .select()
    .eq('week_start', weekStart)
    .not('digest_rank', 'is', null)
    .order('digest_rank', { ascending: true });
  if (error) throw new Error(`listDigestRankedClusters: ${error.message}`);
  return (data ?? []) as NicheCluster[];
}

export async function getClusterById(
  supabase: SupabaseClient,
  id: string,
): Promise<NicheCluster | null> {
  const { data, error } = await supabase
    .from('niche_clusters')
    .select()
    .eq('id', id)
    .maybeSingle();
  if (error && (error as { code?: string }).code !== 'PGRST116') {
    throw new Error(`getClusterById: ${error.message}`);
  }
  return (data as NicheCluster | null) ?? null;
}

export interface NicheClusterInsert {
  weekStart: string; // 'YYYY-MM-DD'
  canonicalTopic: string;
  formatLabel: FormatLabel;
  exampleVideoIds: string[];
  channelCount: number;
  avgViews: number | null;
  avgVelocity24h: number | null;
  outlierDensity: number | null;
  firstSeenAt: string | null;
  firstMoverScore: number | null;
  provenScore: number | null;
  nicheScore: number | null;
  discoveryState: DiscoveryState;
  productionFit: ProductionFit;
  audienceSignal: string | null;
  digestRank: number | null;
  // Nested explainability (signal values + per-component contributions) stored as jsonb.
  explainabilityTopSignals: Record<string, unknown>;
}

/** Idempotent weekly write: delete this week's rows, then insert the fresh set. */
export async function replaceWeek(
  supabase: SupabaseClient,
  weekStart: string,
  rows: NicheClusterInsert[],
): Promise<number> {
  const del = await supabase.from('niche_clusters').delete().eq('week_start', weekStart);
  if (del.error) throw new Error(`replaceWeek(delete): ${del.error.message}`);
  if (rows.length === 0) return 0;
  const payload = rows.map((r) => ({
    week_start: r.weekStart,
    canonical_topic: r.canonicalTopic,
    format_label: r.formatLabel,
    example_video_ids: r.exampleVideoIds,
    channel_count: r.channelCount,
    avg_views: r.avgViews,
    avg_velocity_24h: r.avgVelocity24h,
    outlier_density: r.outlierDensity,
    first_seen_at: r.firstSeenAt,
    first_mover_score: r.firstMoverScore,
    proven_score: r.provenScore,
    niche_score: r.nicheScore,
    discovery_state: r.discoveryState,
    production_fit: r.productionFit,
    audience_signal: r.audienceSignal,
    digest_rank: r.digestRank,
    explainability_top_signals: r.explainabilityTopSignals,
  }));
  const { error } = await supabase.from('niche_clusters').insert(payload);
  if (error) throw new Error(`replaceWeek(insert): ${error.message}`);
  return rows.length;
}
