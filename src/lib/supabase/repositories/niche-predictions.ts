import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type AccuracyVerdict = 'within' | 'below' | 'above';

export interface NichePrediction {
  id: string;
  niche_cluster_id: string;
  predicted_at: string;
  predicted_views_7d_lower: number;
  predicted_views_7d_upper: number;
  actual_video_id: string | null;
  actual_views_7d: number | null;
  accuracy_verdict: AccuracyVerdict | null;
  closed_at: string | null;
}

export interface InsertNichePredictionParams {
  nicheClusterId: string;
  predictedViews7dLower: number;
  predictedViews7dUpper: number;
}

export async function insertNichePrediction(
  supabase: SupabaseClient,
  params: InsertNichePredictionParams,
): Promise<NichePrediction> {
  const { data, error } = await supabase
    .from('niche_predictions')
    .insert({
      niche_cluster_id: params.nicheClusterId,
      predicted_views_7d_lower: params.predictedViews7dLower,
      predicted_views_7d_upper: params.predictedViews7dUpper,
    })
    .select()
    .single();
  if (error) throw new Error(`insertNichePrediction: ${error.message}`);
  return data as NichePrediction;
}

export async function attachActualOutcome(
  supabase: SupabaseClient,
  predictionId: string,
  actualViews7d: number,
): Promise<NichePrediction> {
  // Fetch first to compute verdict
  const { data: existing, error: fetchErr } = await supabase
    .from('niche_predictions')
    .select('predicted_views_7d_lower, predicted_views_7d_upper')
    .eq('id', predictionId)
    .single();
  if (fetchErr) throw new Error(`attachActualOutcome (fetch): ${fetchErr.message}`);
  const lower = (existing as { predicted_views_7d_lower: number }).predicted_views_7d_lower;
  const upper = (existing as { predicted_views_7d_upper: number }).predicted_views_7d_upper;
  let verdict: AccuracyVerdict;
  if (actualViews7d < lower) verdict = 'below';
  else if (actualViews7d > upper) verdict = 'above';
  else verdict = 'within';

  const { data, error } = await supabase
    .from('niche_predictions')
    .update({
      actual_views_7d: actualViews7d,
      accuracy_verdict: verdict,
      closed_at: new Date().toISOString(),
    })
    .eq('id', predictionId)
    .select()
    .single();
  if (error) throw new Error(`attachActualOutcome (update): ${error.message}`);
  return data as NichePrediction;
}

export async function listPredictionsByCluster(
  supabase: SupabaseClient,
  nicheClusterId: string,
): Promise<NichePrediction[]> {
  const { data, error } = await supabase
    .from('niche_predictions')
    .select()
    .eq('niche_cluster_id', nicheClusterId)
    .order('predicted_at', { ascending: false });
  if (error) throw new Error(`listPredictionsByCluster: ${error.message}`);
  return (data ?? []) as NichePrediction[];
}
