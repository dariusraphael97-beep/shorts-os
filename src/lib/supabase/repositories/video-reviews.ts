import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ReviewVerdict = 'pass' | 'needs_work' | 'fail';
export type OverallVerdict = 'ship' | 'revise' | 'block';
export type FeedbackAction = 'accepted' | 'ignored' | 'partial';

export interface ReviewSuggestion {
  component: string;
  severity: ReviewVerdict;
  suggestion_text: string;
  ref_video_ids?: string[];
}

export interface ReviewStrength {
  component: string;
  what_works_text: string;
}

export interface VideoReview {
  id: string;
  your_video_id: string;
  reviewed_at: string;
  title_score: number | null;
  title_verdict: ReviewVerdict | null;
  thumbnail_score: number | null;
  thumbnail_verdict: ReviewVerdict | null;
  hook_score: number | null;
  hook_verdict: ReviewVerdict | null;
  pacing_score: number | null;
  pacing_verdict: ReviewVerdict | null;
  description_seo_score: number | null;
  description_seo_verdict: ReviewVerdict | null;
  audio_score: number | null;
  audio_verdict: ReviewVerdict | null;
  visual_score: number | null;
  visual_verdict: ReviewVerdict | null;
  overall_verdict: OverallVerdict;
  suggestions: ReviewSuggestion[];
  strengths: ReviewStrength[];
  model: string;
  prompt_version: string;
}

/** Compact review row joined with its video's title/status (for Mission Control). */
export interface RecentReview {
  id: string;
  your_video_id: string;
  reviewed_at: string;
  overall_verdict: OverallVerdict;
  video_title: string | null;
  video_status: string | null;
}

export interface InsertVideoReviewParams {
  yourVideoId: string;
  titleScore: number; titleVerdict: ReviewVerdict;
  thumbnailScore: number; thumbnailVerdict: ReviewVerdict;
  hookScore: number; hookVerdict: ReviewVerdict;
  pacingScore: number; pacingVerdict: ReviewVerdict;
  descriptionSeoScore: number; descriptionSeoVerdict: ReviewVerdict;
  audioScore: number; audioVerdict: ReviewVerdict;
  visualScore: number; visualVerdict: ReviewVerdict;
  overallVerdict: OverallVerdict;
  suggestions: ReviewSuggestion[];
  strengths: ReviewStrength[];
  model: string;
  promptVersion: string;
}

export async function insertVideoReview(
  supabase: SupabaseClient,
  params: InsertVideoReviewParams,
): Promise<VideoReview> {
  const { data, error } = await supabase
    .from('video_reviews')
    .insert({
      your_video_id: params.yourVideoId,
      title_score: params.titleScore, title_verdict: params.titleVerdict,
      thumbnail_score: params.thumbnailScore, thumbnail_verdict: params.thumbnailVerdict,
      hook_score: params.hookScore, hook_verdict: params.hookVerdict,
      pacing_score: params.pacingScore, pacing_verdict: params.pacingVerdict,
      description_seo_score: params.descriptionSeoScore, description_seo_verdict: params.descriptionSeoVerdict,
      audio_score: params.audioScore, audio_verdict: params.audioVerdict,
      visual_score: params.visualScore, visual_verdict: params.visualVerdict,
      overall_verdict: params.overallVerdict,
      suggestions: params.suggestions,
      strengths: params.strengths,
      model: params.model,
      prompt_version: params.promptVersion,
    })
    .select()
    .single();
  if (error) throw new Error(`insertVideoReview: ${error.message}`);
  return data as VideoReview;
}

export async function getVideoReviewByVideoId(
  supabase: SupabaseClient,
  yourVideoId: string,
): Promise<VideoReview | null> {
  const { data, error } = await supabase
    .from('video_reviews')
    .select()
    .eq('your_video_id', yourVideoId)
    .order('reviewed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && (error as { code?: string }).code !== 'PGRST116') {
    throw new Error(`getVideoReviewByVideoId: ${error.message}`);
  }
  return (data as VideoReview | null) ?? null;
}

export interface RecordReviewFeedbackParams {
  videoReviewId: string;
  suggestionIndex: number;
  actionTaken: FeedbackAction;
}

export async function recordReviewFeedback(
  supabase: SupabaseClient,
  params: RecordReviewFeedbackParams,
): Promise<{ id: string; video_review_id: string; suggestion_index: number; action_taken: FeedbackAction; recorded_at: string }> {
  const { data, error } = await supabase
    .from('video_review_feedback')
    .insert({
      video_review_id: params.videoReviewId,
      suggestion_index: params.suggestionIndex,
      action_taken: params.actionTaken,
    })
    .select()
    .single();
  if (error) throw new Error(`recordReviewFeedback: ${error.message}`);
  return data as { id: string; video_review_id: string; suggestion_index: number; action_taken: FeedbackAction; recorded_at: string };
}

/** Recent reviews joined with video title/status, newest-first (Mission Control ledger). */
export async function listRecentReviews(
  supabase: SupabaseClient,
  limit: number,
): Promise<RecentReview[]> {
  const { data, error } = await supabase
    .from('video_reviews')
    .select('id, your_video_id, reviewed_at, overall_verdict, your_videos(title, status)')
    .order('reviewed_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listRecentReviews: ${error.message}`);
  type Row = {
    id: string;
    your_video_id: string;
    reviewed_at: string;
    overall_verdict: OverallVerdict;
    your_videos: { title: string | null; status: string | null } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    your_video_id: row.your_video_id,
    reviewed_at: row.reviewed_at,
    overall_verdict: row.overall_verdict,
    video_title: row.your_videos?.title ?? null,
    video_status: row.your_videos?.status ?? null,
  }));
}
