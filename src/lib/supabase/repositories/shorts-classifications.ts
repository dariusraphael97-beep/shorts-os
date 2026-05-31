import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FormatLabel } from '@/lib/classifier/format-labels';

export { FORMAT_LABELS } from '@/lib/classifier/format-labels';
export type { FormatLabel };

export type AudienceSignal =
  | 'seniors' | 'gen_z' | 'millennials' | 'kids' | 'professionals' | 'hobbyists' | 'general';

export interface ShortsClassification {
  video_id: string;
  topic_label: string;
  format_label: FormatLabel;
  audience_signal: AudienceSignal | null;
  confidence: number;
  model: string;
  prompt_version: string;
  vision_used: boolean;
  transcript_used: boolean;
  classified_at: string;
}

export interface UpsertClassificationParams {
  videoId: string;
  topicLabel: string;
  formatLabel: FormatLabel;
  audienceSignal?: AudienceSignal | null;
  confidence: number;
  model: string;
  promptVersion: string;
  visionUsed: boolean;
  transcriptUsed: boolean;
}

export async function upsertClassification(
  supabase: SupabaseClient,
  params: UpsertClassificationParams,
): Promise<ShortsClassification> {
  const { data, error } = await supabase
    .from('shorts_classifications')
    .upsert({
      video_id: params.videoId,
      topic_label: params.topicLabel,
      format_label: params.formatLabel,
      audience_signal: params.audienceSignal ?? null,
      confidence: params.confidence,
      model: params.model,
      prompt_version: params.promptVersion,
      vision_used: params.visionUsed,
      transcript_used: params.transcriptUsed,
      classified_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw new Error(`upsertClassification: ${error.message}`);
  return data as ShortsClassification;
}

export async function getClassificationByVideoId(
  supabase: SupabaseClient,
  videoId: string,
): Promise<ShortsClassification | null> {
  const { data, error } = await supabase
    .from('shorts_classifications')
    .select()
    .eq('video_id', videoId)
    .maybeSingle();
  if (error && (error as { code?: string }).code !== 'PGRST116') {
    throw new Error(`getClassificationByVideoId: ${error.message}`);
  }
  return (data as ShortsClassification | null) ?? null;
}

export async function listStaleClassifications(
  supabase: SupabaseClient,
  currentPromptVersion: string,
  limit: number,
): Promise<ShortsClassification[]> {
  const { data, error } = await supabase
    .from('shorts_classifications')
    .select()
    .neq('prompt_version', currentPromptVersion)
    .limit(limit);
  if (error) throw new Error(`listStaleClassifications: ${error.message}`);
  return (data ?? []) as ShortsClassification[];
}
