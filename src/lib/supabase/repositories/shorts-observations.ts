import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ShortsObservationSource =
  | 'youtube_most_popular'
  | 'youtube_search'
  | 'youtube_watch_list'
  | 'reddit_topic'
  | 'tiktok_creative_center'
  | 'google_trends'
  | 'youtube_dominatable';

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

/** Observations with NO classification row yet (newest first) — classifier work queue. */
export async function listUnclassifiedObservations(
  supabase: SupabaseClient,
  params: { limit: number },
): Promise<ShortsObservation[]> {
  const { data, error } = await (supabase
    .from('shorts_observations')
    .select('*, shorts_classifications!left(video_id)') as unknown as {
      is: (col: string, val: null) => {
        order: (col: string, opts: { ascending: boolean }) => {
          limit: (n: number) => Promise<{ data: (Record<string, unknown> & { shorts_classifications: unknown })[] | null; error: { message: string } | null }>;
        };
      };
    })
    .is('shorts_classifications', null)
    .order('observed_at', { ascending: false })
    .limit(params.limit);
  if (error) throw new Error(`listUnclassifiedObservations: ${error.message}`);
  return (data ?? []).map((row) => {
    const obs = { ...row } as Record<string, unknown>;
    delete obs.shorts_classifications;
    return obs as unknown as ShortsObservation;
  });
}

export interface ClassifiedObservation {
  video_id: string;
  source: ShortsObservationSource;
  channel_id: string | null;
  channel_subscriber_count: number | null;
  description: string | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  published_at: string | null;
  observed_at: string;
  topic_label: string;
  format_label: string;
  audience_signal: string | null;
  confidence: number;
}

/** Observation × classification join over a window, at/above a confidence floor — clustering input. */
export async function listClassifiedObservationsSince(
  supabase: SupabaseClient,
  params: { since: Date; minConfidence: number },
): Promise<ClassifiedObservation[]> {
  const { data, error } = await supabase
    .from('shorts_classifications')
    .select(
      'video_id, topic_label, format_label, audience_signal, confidence, ' +
      'shorts_observations!inner(source, channel_id, channel_subscriber_count, description, view_count, like_count, comment_count, published_at, observed_at)',
    )
    .gte('confidence', params.minConfidence)
    .gte('shorts_observations.observed_at', params.since.toISOString());
  if (error) throw new Error(`listClassifiedObservationsSince: ${error.message}`);
  type JoinRow = {
    video_id: string; topic_label: string; format_label: string; audience_signal: string | null; confidence: number;
    shorts_observations: {
      source: ShortsObservationSource; channel_id: string | null; channel_subscriber_count: number | null;
      description: string | null; view_count: number; like_count: number; comment_count: number;
      published_at: string | null; observed_at: string;
    };
  };
  return ((data ?? []) as unknown as JoinRow[]).map((r) => ({
    video_id: r.video_id, topic_label: r.topic_label, format_label: r.format_label,
    audience_signal: r.audience_signal, confidence: r.confidence,
    source: r.shorts_observations.source, channel_id: r.shorts_observations.channel_id,
    channel_subscriber_count: r.shorts_observations.channel_subscriber_count,
    description: r.shorts_observations.description, view_count: r.shorts_observations.view_count,
    like_count: r.shorts_observations.like_count, comment_count: r.shorts_observations.comment_count,
    published_at: r.shorts_observations.published_at, observed_at: r.shorts_observations.observed_at,
  }));
}
