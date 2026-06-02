import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentId } from "@/lib/agents/types";
import type { LedgerRow } from "@/lib/longform/ledger";

export interface ShotListEntry {
  segment_text: string;
  broll_search_query: string;
  duration_seconds: number;
}

export type DecisionType =
  | "topic_dispatch"
  | "script"
  | "voice_pick"
  | "shot_list"
  | "compilation_assembly";

export async function recordDecision(
  supabase: SupabaseClient,
  args: {
    jobId: string;
    agentId: AgentId;
    decisionType: DecisionType;
    inputs: Record<string, unknown>;
    alternatives?: unknown[];
    chosen: Record<string, unknown>;
    reasoning: string | null;
    scores?: Record<string, number>;
    promptVersion?: string;
    guidanceIdsUsed?: string[];
    yourVideoId?: string;
  },
): Promise<void> {
  const { error } = await supabase.from("decisions").insert({
    job_id: args.jobId,
    agent_id: args.agentId,
    decision_type: args.decisionType,
    inputs: args.inputs,
    alternatives: args.alternatives ?? [],
    chosen: args.chosen,
    scores: args.scores ?? null,
    reasoning: args.reasoning,
    prompt_version: args.promptVersion ?? null,
    guidance_ids_used: args.guidanceIdsUsed ?? [],
    your_video_id: args.yourVideoId ?? null,
  });
  if (error) throw new Error(`recordDecision: ${error.message}`);
}

export async function recordLongformLedger(supabase: SupabaseClient, rows: LedgerRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from("decisions").insert(
    rows.map((r) => ({
      agent_id: r.agentId,
      job_id: r.jobId,
      your_video_id: r.yourVideoId,
      decision_type: r.decisionType,
      inputs: r.inputs,
      chosen: r.chosen,
      reasoning: r.reasoning,
    })),
  );
  if (error) throw new Error(`recordLongformLedger: ${error.message}`);
}

export async function getDirectorShotListForVideo(
  supabase: SupabaseClient,
  yourVideoId: string,
): Promise<ShotListEntry[] | null> {
  // 1. your_video → topic_queue_id
  const { data: yv } = await supabase
    .from("your_videos")
    .select("topic_queue_id")
    .eq("id", yourVideoId)
    .single();
  if (!yv?.topic_queue_id) return null;

  // 2. most recent produce_video job for that topic
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id")
    .eq("kind", "produce_video")
    .eq("topic_queue_id", yv.topic_queue_id)
    .order("created_at", { ascending: false })
    .limit(1);
  const jobRow = jobs?.[0];
  if (!jobRow) return null;

  // 3. latest director decision for that job
  const { data: dec } = await supabase
    .from("decisions")
    .select("chosen")
    .eq("job_id", jobRow.id)
    .eq("agent_id", "director")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  const shotList = (dec?.chosen as { shot_list?: unknown } | undefined)?.shot_list;
  if (!Array.isArray(shotList) || shotList.length === 0) return null;
  return shotList as ShotListEntry[];
}
