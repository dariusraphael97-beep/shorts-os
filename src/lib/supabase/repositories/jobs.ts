import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentId } from "@/lib/agents/types";

export type JobKind = "scrape" | "score_topics" | "produce_video" | "analyze_performance" | "produce_longform_video";
export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type Job = {
  id: string;
  kind: JobKind;
  channel_id: string | null;
  topic_queue_id: string | null;
  status: JobStatus;
  current_step: string | null;
  current_agent: string | null;
  progress_pct: number | null;
  error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export async function createProduceVideoJob(
  supabase: SupabaseClient,
  args: { topicId: string; channelId: string },
): Promise<Job> {
  const { data, error } = await supabase
    .from("jobs")
    .insert({
      kind: "produce_video",
      status: "running",
      topic_queue_id: args.topicId,
      channel_id: args.channelId,
      current_step: "strategist",
      current_agent: "strategist",
      progress_pct: 0,
      started_at: new Date().toISOString(),
      metadata: {},
    })
    .select("*")
    .single();
  if (error) throw new Error(`createProduceVideoJob: ${error.message}`);
  return data as Job;
}

export async function createProduceLongformJob(
  supabase: SupabaseClient,
  args: { channelId: string },
): Promise<Job> {
  const { data, error } = await supabase
    .from("jobs")
    .insert({
      kind: "produce_longform_video",
      status: "running",
      channel_id: args.channelId,
      current_step: "writer",
      current_agent: "writer",
      progress_pct: 0,
      started_at: new Date().toISOString(),
      metadata: {},
    })
    .select("*")
    .single();
  if (error) throw new Error(`createProduceLongformJob: ${error.message}`);
  return data as Job;
}

export async function getActiveProduceVideoJob(supabase: SupabaseClient): Promise<Job | null> {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("kind", "produce_video")
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getActiveProduceVideoJob: ${error.message}`);
  return (data ?? null) as Job | null;
}

export async function updateJobProgress(
  supabase: SupabaseClient,
  jobId: string,
  args: { currentAgent: AgentId; progressPct: number },
): Promise<void> {
  const { error } = await supabase
    .from("jobs")
    .update({
      current_agent: args.currentAgent,
      current_step: args.currentAgent,
      progress_pct: args.progressPct,
    })
    .eq("id", jobId);
  if (error) throw new Error(`updateJobProgress: ${error.message}`);
}

export async function finishJobSuccess(supabase: SupabaseClient, jobId: string): Promise<void> {
  const { error } = await supabase
    .from("jobs")
    .update({
      status: "succeeded",
      progress_pct: 100,
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (error) throw new Error(`finishJobSuccess: ${error.message}`);
}

export async function finishJobFailure(
  supabase: SupabaseClient,
  jobId: string,
  errorMessage: string,
): Promise<void> {
  const { error } = await supabase
    .from("jobs")
    .update({
      status: "failed",
      error: errorMessage,
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (error) throw new Error(`finishJobFailure: ${error.message}`);
}
