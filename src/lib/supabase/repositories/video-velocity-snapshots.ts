import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface VelocitySnapshotRow {
  video_id: string;
  snapshot_at: string;
  view_count: number;
  like_count: number;
  comment_count: number;
}

export async function insertVelocitySnapshot(
  supabase: SupabaseClient,
  params: { videoId: string; viewCount: number; likeCount?: number; commentCount?: number; snapshotAt?: Date },
): Promise<VelocitySnapshotRow> {
  const { data, error } = await supabase
    .from('video_velocity_snapshots')
    .insert({
      video_id: params.videoId,
      view_count: params.viewCount,
      like_count: params.likeCount ?? 0,
      comment_count: params.commentCount ?? 0,
      snapshot_at: (params.snapshotAt ?? new Date()).toISOString(),
    })
    .select()
    .single();
  if (error) throw new Error(`insertVelocitySnapshot: ${error.message}`);
  return data as VelocitySnapshotRow;
}

export async function listSnapshotsForVideo(
  supabase: SupabaseClient,
  params: { videoId: string; limit: number },
): Promise<VelocitySnapshotRow[]> {
  const { data, error } = await supabase
    .from('video_velocity_snapshots')
    .select()
    .eq('video_id', params.videoId)
    .order('snapshot_at', { ascending: false })
    .limit(params.limit);
  if (error) throw new Error(`listSnapshotsForVideo: ${error.message}`);
  return (data ?? []) as VelocitySnapshotRow[];
}
