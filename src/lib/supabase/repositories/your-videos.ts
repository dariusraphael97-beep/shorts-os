import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DateTime } from 'luxon';

export type VideoStatus = "draft" | "rendering" | "rendered" | "posted" | "failed";

export type YourVideo = {
  id: string;
  channel_id: string;
  topic_queue_id: string | null;
  external_video_id: string | null;
  url: string | null;
  title: string;
  description: string | null;
  script: string | null;
  voice_provider: string | null;
  voice_id: string | null;
  duration_seconds: number | null;
  visual_treatment: string | null;
  caption_props: Record<string, unknown> | null;
  posted_at: string | null;
  status: VideoStatus;
  render_artifact_url: string | null;
  source_compilation_draft_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function createVideoDraft(
  supabase: SupabaseClient,
  args: {
    channelId: string;
    topicQueueId: string;
    title: string;
    script: string;
    voiceProvider: string;
    voiceId: string;
    visualTreatment: string;
    durationSeconds: number;
    captionProps: Record<string, unknown>;
  },
): Promise<YourVideo> {
  const { data, error } = await supabase
    .from("your_videos")
    .insert({
      channel_id: args.channelId,
      topic_queue_id: args.topicQueueId,
      title: args.title,
      script: args.script,
      voice_provider: args.voiceProvider,
      voice_id: args.voiceId,
      visual_treatment: args.visualTreatment,
      duration_seconds: args.durationSeconds,
      caption_props: args.captionProps,
      status: "draft",
    })
    .select("*")
    .single();
  if (error) throw new Error(`createVideoDraft: ${error.message}`);
  return data as YourVideo;
}

export async function listRecentDrafts(
  supabase: SupabaseClient,
  limit = 10,
): Promise<YourVideo[]> {
  const { data, error } = await supabase
    .from("your_videos")
    .select("*")
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listRecentDrafts: ${error.message}`);
  return (data ?? []) as YourVideo[];
}

export async function discardDraft(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("your_videos").update({ status: "failed" }).eq("id", id);
  if (error) throw new Error(`discardDraft: ${error.message}`);
}

export async function createPromotedVideo(
  supabase: SupabaseClient,
  args: {
    channelId: string;
    title: string;
    renderArtifactUrl: string;
    durationSeconds: number;
    sourceCompilationDraftId: string;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from("your_videos")
    .insert({
      channel_id: args.channelId,
      title: args.title,
      script: null, // compilations have no narration script
      voice_provider: null,
      voice_id: null,
      visual_treatment: "top5_compilation",
      duration_seconds: args.durationSeconds,
      render_artifact_url: args.renderArtifactUrl,
      status: "rendered" as VideoStatus,
      source_compilation_draft_id: args.sourceCompilationDraftId,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createPromotedVideo: ${error.message}`);
  return data.id as string;
}

export async function listVideosByStatus(
  supabase: SupabaseClient,
  status: VideoStatus | VideoStatus[],
  limit = 20,
): Promise<YourVideo[]> {
  const statuses = Array.isArray(status) ? status : [status];
  const { data, error } = await supabase
    .from("your_videos")
    .select("*")
    .in("status", statuses)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listVideosByStatus: ${error.message}`);
  return (data ?? []) as YourVideo[];
}

export async function markPosted(
  supabase: SupabaseClient,
  args: {
    videoId: string;
    externalVideoId: string;
    url: string;
    postedAt: Date;
    channelTimezone: string;
  },
): Promise<void> {
  const local = DateTime.fromJSDate(args.postedAt).setZone(args.channelTimezone);
  // luxon weekday: 1=Mon..7=Sun. Convert to 0=Sun..6=Sat.
  const dow = local.weekday === 7 ? 0 : local.weekday;
  const { error } = await supabase
    .from('your_videos')
    .update({
      external_video_id: args.externalVideoId,
      url: args.url,
      posted_at: args.postedAt.toISOString(),
      posted_hour_local: local.hour,
      posted_dow_local: dow,
      status: 'posted',
      updated_at: new Date().toISOString(),
    })
    .eq('id', args.videoId);
  if (error) throw new Error(`markPosted: ${error.message}`);
}
