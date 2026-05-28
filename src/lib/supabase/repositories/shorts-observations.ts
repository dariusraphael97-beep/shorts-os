import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ShortsObservationSource =
  | 'youtube_most_popular'
  | 'youtube_search'
  | 'youtube_watch_list'
  | 'reddit_topic'
  | 'tiktok_creative_center'
  | 'google_trends';

export interface ShortsObservation {
  video_id: string;
  source: ShortsObservationSource;
  channel_id: string | null;
  channel_subscriber_count: number | null;
  title: string;
  description: string | null;
  tags: unknown[];
  thumbnail_url: string | null;
  duration_seconds: number | null;
  published_at: string | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  observed_at: string;
  last_refreshed_at: string;
}

export interface UpsertShortsObservationParams {
  videoId: string;
  source: ShortsObservationSource;
  channelId?: string | null;
  channelSubscriberCount?: number | null;
  title: string;
  description?: string | null;
  tags?: unknown[];
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
  publishedAt?: Date | null;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  observedAt?: Date;
}

export async function upsertShortsObservation(
  supabase: SupabaseClient,
  params: UpsertShortsObservationParams,
): Promise<ShortsObservation> {
  const { data, error } = await supabase
    .from('shorts_observations')
    .upsert({
      video_id: params.videoId,
      source: params.source,
      channel_id: params.channelId ?? null,
      channel_subscriber_count: params.channelSubscriberCount ?? null,
      title: params.title,
      description: params.description ?? null,
      tags: params.tags ?? [],
      thumbnail_url: params.thumbnailUrl ?? null,
      duration_seconds: params.durationSeconds ?? null,
      published_at: params.publishedAt ? params.publishedAt.toISOString() : null,
      view_count: params.viewCount ?? 0,
      like_count: params.likeCount ?? 0,
      comment_count: params.commentCount ?? 0,
      observed_at: (params.observedAt ?? new Date()).toISOString(),
      last_refreshed_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw new Error(`upsertShortsObservation: ${error.message}`);
  return data as ShortsObservation;
}

export async function getShortsObservationByVideoId(
  supabase: SupabaseClient,
  videoId: string,
): Promise<ShortsObservation | null> {
  const { data, error } = await supabase
    .from('shorts_observations')
    .select()
    .eq('video_id', videoId)
    .maybeSingle();
  if (error && (error as { code?: string }).code !== 'PGRST116') {
    throw new Error(`getShortsObservationByVideoId: ${error.message}`);
  }
  return (data as ShortsObservation | null) ?? null;
}

export async function listShortsObservationsBySource(
  supabase: SupabaseClient,
  source: ShortsObservationSource,
  limit: number,
): Promise<ShortsObservation[]> {
  const { data, error } = await supabase
    .from('shorts_observations')
    .select()
    .eq('source', source)
    .order('observed_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listShortsObservationsBySource: ${error.message}`);
  return (data ?? []) as ShortsObservation[];
}
