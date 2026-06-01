import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DateTime } from 'luxon';

export type VideoStatus = "draft" | "rendering" | "rendered" | "scheduled" | "uploading" | "posted" | "failed";

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
  scheduled_for: string | null;
  posted_hour_local: number | null;
  posted_dow_local: number | null;
  status: VideoStatus;
  render_artifact_url: string | null;
  source_compilation_draft_id: string | null;
  source_niche_cluster_id: string | null;
  script_brief: Record<string, unknown> | null;
  review_id: string | null;
  editor_session_id: string | null;
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
    sourceNicheClusterId?: string | null;
    scriptBrief?: Record<string, unknown> | null;
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
      source_niche_cluster_id: args.sourceNicheClusterId ?? null,
      script_brief: args.scriptBrief ?? null,
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

export async function getYourVideoById(
  supabase: SupabaseClient,
  id: string,
): Promise<YourVideo | null> {
  const { data, error } = await supabase
    .from("your_videos")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getYourVideoById: ${error.message}`);
  return data as YourVideo | null;
}

export async function getLatestYourVideoByTopic(
  supabase: SupabaseClient,
  topicId: string,
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("your_videos")
    .select("id")
    .eq("topic_queue_id", topicId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getLatestYourVideoByTopic: ${error.message}`);
  return (data ?? null) as { id: string } | null;
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
    targetStatus?: 'rendered' | 'scheduled' | 'uploading';
    scheduledFor?: Date | null;
  },
): Promise<string> {
  const status: VideoStatus = (args.targetStatus ?? 'rendered') as VideoStatus;
  const { data, error } = await supabase
    .from('your_videos')
    .insert({
      channel_id: args.channelId,
      title: args.title,
      script: null,
      voice_provider: null,
      voice_id: null,
      visual_treatment: 'top5_compilation',
      duration_seconds: args.durationSeconds,
      render_artifact_url: args.renderArtifactUrl,
      status,
      scheduled_for: args.scheduledFor ? args.scheduledFor.toISOString() : null,
      source_compilation_draft_id: args.sourceCompilationDraftId,
    })
    .select('id')
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

export async function scheduleVideo(
  supabase: SupabaseClient,
  args: { videoId: string; scheduledFor: Date },
): Promise<boolean> {
  const { error, count } = await supabase
    .from("your_videos")
    .update(
      {
        status: "scheduled",
        scheduled_for: args.scheduledFor.toISOString(),
        updated_at: new Date().toISOString(),
      },
      { count: "exact" },
    )
    .eq("id", args.videoId)
    .eq("status", "rendered");
  if (error) throw new Error(`scheduleVideo: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function cancelSchedule(
  supabase: SupabaseClient,
  videoId: string,
): Promise<boolean> {
  const { error, count } = await supabase
    .from("your_videos")
    .update(
      { status: "rendered", scheduled_for: null, updated_at: new Date().toISOString() },
      { count: "exact" },
    )
    .eq("id", videoId)
    .eq("status", "scheduled");
  if (error) throw new Error(`cancelSchedule: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function rescheduleVideo(
  supabase: SupabaseClient,
  args: { videoId: string; scheduledFor: Date },
): Promise<boolean> {
  const { error, count } = await supabase
    .from("your_videos")
    .update(
      { scheduled_for: args.scheduledFor.toISOString(), updated_at: new Date().toISOString() },
      { count: "exact" },
    )
    .eq("id", args.videoId)
    .eq("status", "scheduled");
  if (error) throw new Error(`rescheduleVideo: ${error.message}`);
  return (count ?? 0) > 0;
}

const SLOT_TOLERANCE_MS = 5 * 60 * 1000;

export async function slotIsOccupied(
  supabase: SupabaseClient,
  channelId: string,
  slotUtc: Date,
): Promise<boolean> {
  const from = new Date(slotUtc.getTime() - SLOT_TOLERANCE_MS).toISOString();
  const to = new Date(slotUtc.getTime() + SLOT_TOLERANCE_MS).toISOString();
  const { data, error } = await supabase
    .from("your_videos")
    .select("id")
    .eq("channel_id", channelId)
    .in("status", ["scheduled", "uploading", "posted"])
    .gte("scheduled_for", from)
    .lte("scheduled_for", to);
  if (error) throw new Error(`slotIsOccupied: ${error.message}`);
  return (data ?? []).length > 0;
}

export async function listScheduledForChannelInRange(
  supabase: SupabaseClient,
  args: { channelId: string; fromUtc: Date; toUtc: Date },
): Promise<YourVideo[]> {
  const { data, error } = await supabase
    .from("your_videos")
    .select("*")
    .eq("channel_id", args.channelId)
    .eq("status", "scheduled")
    .gte("scheduled_for", args.fromUtc.toISOString())
    .lt("scheduled_for", args.toUtc.toISOString());
  if (error) throw new Error(`listScheduledForChannelInRange: ${error.message}`);
  return (data ?? []) as YourVideo[];
}

export async function countTodayUploads(
  supabase: SupabaseClient,
  args: { channelId: string; nowUtc: Date; tz: string },
): Promise<number> {
  // Counts your_videos in (uploading OR posted) whose updated_at falls within
  // today (channel timezone). Used by scheduled-uploader to enforce max_uploads_per_day.
  // For 'uploading' rows posted_at is null, so we fall back to updated_at.
  const local = DateTime.fromJSDate(args.nowUtc).setZone(args.tz);
  const startUtc = local.startOf("day").toUTC().toISO();
  const endUtc = local.endOf("day").toUTC().toISO();
  const { data, error } = await supabase
    .from("your_videos")
    .select("id, status, posted_at, updated_at")
    .eq("channel_id", args.channelId)
    .in("status", ["uploading", "posted"])
    .gte("updated_at", startUtc!)
    .lte("updated_at", endUtc!);
  if (error) throw new Error(`countTodayUploads: ${error.message}`);
  return (data ?? []).length;
}

export interface ClaimedRow {
  id: string;
  channel_id: string;
}

// ─── Recent videos with review verdict ───────────────────────────────────────

export interface VideoWithVerdict {
  id: string;
  title: string;
  status: VideoStatus;
  render_artifact_url: string | null;
  review_id: string | null;
  created_at: string;
  /** Populated by a second fetch keyed by review_id — null when no review exists */
  overall_verdict: "ship" | "revise" | "block" | null;
}

/**
 * Returns up to `limit` your_videos rows across ALL statuses, newest first,
 * each decorated with the review's overall_verdict (via a two-step fetch on
 * the existing review_id FK).  The two-step approach is used instead of an
 * embedded select because the JS client requires the FK constraint hint name
 * which may differ across environments.
 */
export async function listRecentVideosWithReview(
  supabase: SupabaseClient,
  limit = 10,
): Promise<VideoWithVerdict[]> {
  // Step 1 — fetch the base rows
  const { data: rows, error } = await supabase
    .from("your_videos")
    .select("id, title, status, render_artifact_url, review_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listRecentVideosWithReview: ${error.message}`);
  if (!rows || rows.length === 0) return [];

  // Step 2 — collect distinct review_ids and fetch their verdicts
  const reviewIds = [...new Set(
    (rows as { review_id: string | null }[])
      .map((r) => r.review_id)
      .filter((id): id is string => id !== null),
  )];

  let verdictMap = new Map<string, "ship" | "revise" | "block">();
  if (reviewIds.length > 0) {
    const { data: reviews, error: revErr } = await supabase
      .from("video_reviews")
      .select("id, overall_verdict")
      .in("id", reviewIds);
    if (revErr) throw new Error(`listRecentVideosWithReview (reviews): ${revErr.message}`);
    for (const rv of (reviews ?? []) as { id: string; overall_verdict: "ship" | "revise" | "block" }[]) {
      verdictMap.set(rv.id, rv.overall_verdict);
    }
  }

  return (rows as {
    id: string;
    title: string;
    status: VideoStatus;
    render_artifact_url: string | null;
    review_id: string | null;
    created_at: string;
  }[]).map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    render_artifact_url: r.render_artifact_url,
    review_id: r.review_id,
    created_at: r.created_at,
    overall_verdict: r.review_id ? (verdictMap.get(r.review_id) ?? null) : null,
  }));
}

export async function claimDueScheduled(
  supabase: SupabaseClient,
  args: { now: Date; limit: number },
): Promise<ClaimedRow[]> {
  const { data, error } = await supabase.rpc("claim_due_scheduled_uploads", {
    p_now: args.now.toISOString(),
    p_limit: args.limit,
  });
  if (error) throw new Error(`claimDueScheduled: ${error.message}`);
  return (data ?? []) as ClaimedRow[];
}
