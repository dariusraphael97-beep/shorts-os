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

/** Predictions that have not yet been closed (no actual outcome attached). */
export async function listOpenPredictions(supabase: SupabaseClient): Promise<NichePrediction[]> {
  const { data, error } = await supabase
    .from('niche_predictions')
    .select()
    .is('closed_at', null)
    .order('predicted_at', { ascending: true });
  if (error) throw new Error(`listOpenPredictions: ${error.message}`);
  return (data ?? []) as NichePrediction[];
}

export interface CloseablePredictionRow {
  predictionId: string;
  actualVideoId: string;
  actualViews7d: number;
}

/**
 * Open predictions whose cluster produced a posted video (≥7 days ago) that has a
 * `video_analytics` views snapshot — i.e. ready to close. Spans niche_predictions →
 * your_videos (source_niche_cluster_id) → video_analytics.
 *
 * Cold-start note: returns [] until a generated niche video has posted AND accrued an
 * analytics snapshot. "7-day views" is approximated by the latest analytics snapshot for
 * a video posted at least 7 days ago (no dedicated 7-day column exists; snapshots accrue
 * over time). Best-effort and auditable via actual_video_id on the closed prediction.
 */
export async function listCloseablePredictions(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<CloseablePredictionRow[]> {
  const open = await listOpenPredictions(supabase);
  if (open.length === 0) return [];

  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const out: CloseablePredictionRow[] = [];

  for (const pred of open) {
    const { data: vids, error: vidErr } = await supabase
      .from('your_videos')
      .select('id, posted_at')
      .eq('source_niche_cluster_id', pred.niche_cluster_id)
      .eq('status', 'posted')
      .not('posted_at', 'is', null)
      .lte('posted_at', sevenDaysAgo)
      .order('posted_at', { ascending: true })
      .limit(1);
    if (vidErr) throw new Error(`listCloseablePredictions(videos): ${vidErr.message}`);
    const vid = ((vids ?? []) as Array<{ id: string; posted_at: string }>)[0];
    if (!vid) continue;

    const { data: snaps, error: snapErr } = await supabase
      .from('video_analytics')
      .select('views')
      .eq('your_video_id', vid.id)
      .not('views', 'is', null)
      .order('snapshot_at', { ascending: false })
      .limit(1);
    if (snapErr) throw new Error(`listCloseablePredictions(analytics): ${snapErr.message}`);
    const snap = ((snaps ?? []) as Array<{ views: number | null }>)[0];
    if (!snap || snap.views === null) continue;

    out.push({ predictionId: pred.id, actualVideoId: vid.id, actualViews7d: Number(snap.views) });
  }
  return out;
}

/** Closed predictions (outcome attached) — powers the accuracy aggregate. */
export async function listClosedPredictions(supabase: SupabaseClient): Promise<NichePrediction[]> {
  const { data, error } = await supabase
    .from("niche_predictions")
    .select()
    .not("closed_at", "is", null)
    .order("closed_at", { ascending: false });
  if (error) throw new Error(`listClosedPredictions: ${error.message}`);
  return (data ?? []) as NichePrediction[];
}
