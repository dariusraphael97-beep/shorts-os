import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentId } from "@/lib/agents/types";

export type AgentMessageIntent =
  | "dispatch"
  | "script"
  | "voice_pick"
  | "shot_list"
  | "compilation_brief"
  | "error";

export async function recordAgentMessage(
  supabase: SupabaseClient,
  args: {
    jobId: string;
    fromAgent: AgentId;
    toAgent: AgentId | null;
    intent: AgentMessageIntent;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from("agent_messages").insert({
    job_id: args.jobId,
    from_agent: args.fromAgent,
    to_agent: args.toAgent,
    intent: args.intent,
    payload: args.payload,
  });
  if (error) throw new Error(`recordAgentMessage: ${error.message}`);
}
