import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ScheduleRecommendationRow {
  id: string;
  channel_id: string;
  recommended_posting_schedule: unknown;
  recommended_format_mix: unknown;
  evidence: unknown;
  confidence: "low" | "medium" | "high";
  status: "pending" | "applied" | "dismissed" | "superseded";
  created_at: string;
}

export async function listPendingRecommendations(
  supabase: SupabaseClient,
  channelId: string,
): Promise<ScheduleRecommendationRow[]> {
  const { data, error } = await supabase
    .from("schedule_recommendations")
    .select("*")
    .eq("channel_id", channelId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listPendingRecommendations: ${error.message}`);
  return (data ?? []) as ScheduleRecommendationRow[];
}

export async function applyRecommendation(
  supabase: SupabaseClient,
  recId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("schedule_recommendations")
    .select("id, channel_id, recommended_posting_schedule, recommended_format_mix")
    .eq("id", recId)
    .single();
  if (error || !data) throw new Error(`applyRecommendation: ${error?.message ?? "not found"}`);
  const row = data as {
    id: string;
    channel_id: string;
    recommended_posting_schedule: unknown;
    recommended_format_mix: unknown;
  };

  const patch: Record<string, unknown> = {};
  if (row.recommended_posting_schedule != null) patch.posting_schedule = row.recommended_posting_schedule;
  if (row.recommended_format_mix != null) patch.target_format_mix = row.recommended_format_mix;
  if (Object.keys(patch).length > 0) {
    const { error: chErr } = await supabase.from("channels").update(patch).eq("id", row.channel_id);
    if (chErr) throw new Error(`applyRecommendation channels.update: ${chErr.message}`);
  }
  const now = new Date().toISOString();
  const { error: recErr } = await supabase
    .from("schedule_recommendations")
    .update({ status: "applied", applied_at: now })
    .eq("id", recId);
  if (recErr) throw new Error(`applyRecommendation status: ${recErr.message}`);
}

export async function dismissRecommendation(
  supabase: SupabaseClient,
  recId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("schedule_recommendations")
    .update({ status: "dismissed", dismissed_at: now })
    .eq("id", recId);
  if (error) throw new Error(`dismissRecommendation: ${error.message}`);
}
