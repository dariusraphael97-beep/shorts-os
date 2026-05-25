import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type VideoStatus = "draft" | "rendering" | "rendered" | "posted" | "failed";

export type YourVideo = {
  id: string;
  channel_id: string;
  topic_queue_id: string | null;
  external_video_id: string | null;
  url: string | null;
  title: string;
  description: string | null;
  script: string;
  voice_provider: string | null;
  voice_id: string | null;
  duration_seconds: number | null;
  visual_treatment: string | null;
  posted_at: string | null;
  status: VideoStatus;
  render_artifact_url: string | null;
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
