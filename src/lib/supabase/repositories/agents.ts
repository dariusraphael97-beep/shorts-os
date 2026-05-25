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
