import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type DiscoverySource = 'manual' | 'auto_breakout' | 'auto_outlier';

export interface WatchedChannel {
  channel_id: string;
  channel_handle: string | null;
  channel_title: string | null;
  channel_thumbnail_url: string | null;
  subscriber_count_at_add: number;
  current_subscriber_count: number;
  subscriber_growth_30d: number | null;
  subscriber_growth_90d: number | null;
  outlier_rate_60d: number | null;
  upload_cadence_per_week: number | null;
  added_at: string;
  discovery_source: DiscoverySource;
  is_active: boolean;
  last_snapshotted_at: string | null;
}

export interface UpsertWatchedChannelParams {
  channelId: string;
  channelHandle?: string | null;
  channelTitle?: string | null;
  channelThumbnailUrl?: string | null;
  subscriberCountAtAdd: number;
  currentSubscriberCount: number;
  subscriberGrowth30d?: number | null;
  subscriberGrowth90d?: number | null;
  outlierRate60d?: number | null;
  uploadCadencePerWeek?: number | null;
  discoverySource: DiscoverySource;
}

export async function upsertWatchedChannel(
  supabase: SupabaseClient,
  params: UpsertWatchedChannelParams,
): Promise<WatchedChannel> {
  const { data, error } = await supabase
    .from('watched_channels')
    .upsert({
      channel_id: params.channelId,
      channel_handle: params.channelHandle ?? null,
      channel_title: params.channelTitle ?? null,
      channel_thumbnail_url: params.channelThumbnailUrl ?? null,
      subscriber_count_at_add: params.subscriberCountAtAdd,
      current_subscriber_count: params.currentSubscriberCount,
      subscriber_growth_30d: params.subscriberGrowth30d ?? null,
      subscriber_growth_90d: params.subscriberGrowth90d ?? null,
      outlier_rate_60d: params.outlierRate60d ?? null,
      upload_cadence_per_week: params.uploadCadencePerWeek ?? null,
      discovery_source: params.discoverySource,
      is_active: true,
    })
    .select()
    .single();
  if (error) throw new Error(`upsertWatchedChannel: ${error.message}`);
  return data as WatchedChannel;
}

export async function listActiveWatchedChannels(
  supabase: SupabaseClient,
  limit: number,
): Promise<WatchedChannel[]> {
  const { data, error } = await supabase
    .from('watched_channels')
    .select()
    .eq('is_active', true)
    .order('last_snapshotted_at', { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(`listActiveWatchedChannels: ${error.message}`);
  return (data ?? []) as WatchedChannel[];
}

export async function evictInactiveWatchedChannels(
  supabase: SupabaseClient,
  cutoffDate: Date,
): Promise<number> {
  const { count, error } = await supabase
    .from('watched_channels')
    .update({ is_active: false }, { count: 'exact' })
    .eq('is_active', true)
    .lt('last_snapshotted_at', cutoffDate.toISOString());
  if (error) throw new Error(`evictInactiveWatchedChannels: ${error.message}`);
  return count ?? 0;
}
