import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// TEMP until Task 1.2 ships src/lib/agents/types.ts
type AgentId = "strategist" | "writer" | "voice_coach" | "director";

export type DecisionType =
  | "topic_dispatch"
  | "script"
  | "voice_pick"
  | "shot_list";

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
  });
  if (error) throw new Error(`recordDecision: ${error.message}`);
}
