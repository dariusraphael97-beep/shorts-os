import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FormatLabel } from '@/lib/supabase/repositories/shorts-classifications';

export type ReviewVerdict = 'correct' | 'wrong' | 'partial';

export interface ClassificationSample {
  id: string;
  video_id: string;
  prompt_full: string;
  response_full: string;
  chosen_labels: Record<string, unknown>;
  reviewed: boolean;
  review_verdict: ReviewVerdict | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export async function insertClassificationSample(
  supabase: SupabaseClient,
  params: { videoId: string; promptFull: string; responseFull: string; chosenLabels: Record<string, unknown> },
): Promise<ClassificationSample> {
  const { data, error } = await supabase
    .from('classification_samples')
    .insert({
      video_id: params.videoId,
      prompt_full: params.promptFull,
      response_full: params.responseFull,
      chosen_labels: params.chosenLabels,
    })
    .select()
    .single();
  if (error) throw new Error(`insertClassificationSample: ${error.message}`);
  return data as ClassificationSample;
}

export async function listUnreviewedSamples(
  supabase: SupabaseClient,
  params: { limit: number },
): Promise<ClassificationSample[]> {
  const { data, error } = await supabase
    .from('classification_samples')
    .select()
    .eq('reviewed', false)
    .order('created_at', { ascending: true })
    .limit(params.limit);
  if (error) throw new Error(`listUnreviewedSamples: ${error.message}`);
  return (data ?? []) as ClassificationSample[];
}

export async function recordSampleVerdict(
  supabase: SupabaseClient,
  params: { id: string; verdict: ReviewVerdict; reviewedBy: string },
): Promise<ClassificationSample> {
  const { data, error } = await supabase
    .from('classification_samples')
    .update({
      reviewed: true,
      review_verdict: params.verdict,
      reviewed_by: params.reviewedBy,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select()
    .single();
  if (error) throw new Error(`recordSampleVerdict: ${error.message}`);
  return data as ClassificationSample;
}

export interface FormatAccuracy {
  format_label: FormatLabel;
  correct: number;
  partial: number;
  wrong: number;
  total: number;
}

/** Aggregate reviewed-sample verdicts per format_label (from chosen_labels.format_label). */
export async function aggregateAccuracyByFormat(supabase: SupabaseClient): Promise<FormatAccuracy[]> {
  const { data, error } = await supabase
    .from('classification_samples')
    .select('chosen_labels, review_verdict, reviewed')
    .eq('reviewed', true);
  if (error) throw new Error(`aggregateAccuracyByFormat: ${error.message}`);
  const byFormat = new Map<string, FormatAccuracy>();
  for (const row of (data ?? []) as Array<{ chosen_labels: Record<string, unknown>; review_verdict: ReviewVerdict | null }>) {
    const fmt = String(row.chosen_labels?.format_label ?? 'other') as FormatLabel;
    const acc = byFormat.get(fmt) ?? { format_label: fmt, correct: 0, partial: 0, wrong: 0, total: 0 };
    acc.total++;
    if (row.review_verdict === 'correct') acc.correct++;
    else if (row.review_verdict === 'partial') acc.partial++;
    else if (row.review_verdict === 'wrong') acc.wrong++;
    byFormat.set(fmt, acc);
  }
  return [...byFormat.values()];
}
