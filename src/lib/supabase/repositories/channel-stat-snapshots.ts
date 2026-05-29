import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ChannelStatSnapshotRow {
  channel_id: string;
  snapshot_at: string;
  subscriber_count: number;
  video_count: number | null;
  view_count: number | null;
}

export async function insertChannelStatSnapshot(
  supabase: SupabaseClient,
  params: { channelId: string; subscriberCount: number; videoCount?: number | null; viewCount?: number | null; snapshotAt?: Date },
): Promise<ChannelStatSnapshotRow> {
  const { data, error } = await supabase
    .from('channel_stat_snapshots')
    .insert({
      channel_id: params.channelId,
      subscriber_count: params.subscriberCount,
      video_count: params.videoCount ?? null,
      view_count: params.viewCount ?? null,
      snapshot_at: (params.snapshotAt ?? new Date()).toISOString(),
    })
    .select()
    .single();
  if (error) throw new Error(`insertChannelStatSnapshot: ${error.message}`);
  return data as ChannelStatSnapshotRow;
}

export async function getSnapshotNearestTo(
  supabase: SupabaseClient,
  params: { channelId: string; targetDate: Date },
): Promise<ChannelStatSnapshotRow | null> {
  const { data, error } = await supabase
    .from('channel_stat_snapshots')
    .select()
    .eq('channel_id', params.channelId)
    .lte('snapshot_at', params.targetDate.toISOString())
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && (error as { code?: string }).code !== 'PGRST116') {
    throw new Error(`getSnapshotNearestTo: ${error.message}`);
  }
  return (data as ChannelStatSnapshotRow | null) ?? null;
}

export async function listSnapshotsForChannel(
  supabase: SupabaseClient,
  params: { channelId: string; limit: number },
): Promise<ChannelStatSnapshotRow[]> {
  const { data, error } = await supabase
    .from('channel_stat_snapshots')
    .select()
    .eq('channel_id', params.channelId)
    .order('snapshot_at', { ascending: false })
    .limit(params.limit);
  if (error) throw new Error(`listSnapshotsForChannel: ${error.message}`);
  return (data ?? []) as ChannelStatSnapshotRow[];
}
