import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AgentState = "idle" | "thinking" | "working" | "awaiting_input";

export type Agent = {
  id: string;
  display_name: string;
  emoji: string | null;
  description: string;
  prompt_template: string;
  prompt_version: number;
  model_id: string;
  is_active: boolean;
  total_decisions: number;
  total_wins: number;
  current_state: AgentState;
  current_task: string | null;
  updated_at: string;
};

export async function listAgents(supabase: SupabaseClient): Promise<Agent[]> {
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .order("id", { ascending: true });
  if (error) throw new Error(`listAgents: ${error.message}`);
  return (data ?? []) as Agent[];
}

export async function updateAgentState(
  supabase: SupabaseClient,
  id: string,
  state: AgentState,
  currentTask: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("agents")
    .update({
      current_state: state,
      current_task: currentTask,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(`updateAgentState: ${error.message}`);
}
