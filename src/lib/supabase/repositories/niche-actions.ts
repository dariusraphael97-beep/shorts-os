import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type NicheActionType = "viewed" | "investigated" | "generated_from" | "dismissed" | "hidden";

export async function recordNicheAction(
  supabase: SupabaseClient,
  params: { nicheClusterId: string; action: NicheActionType; actor?: string | null },
): Promise<void> {
  const { error } = await supabase.from("niche_actions").insert({
    niche_cluster_id: params.nicheClusterId,
    action: params.action,
    actor: params.actor ?? "darius",
  } as unknown as Record<string, unknown>);
  if (error) throw new Error(`recordNicheAction: ${error.message}`);
}

export async function countActionsByCluster(
  supabase: SupabaseClient,
  nicheClusterId: string,
): Promise<Record<NicheActionType, number>> {
  const { data, error } = await supabase
    .from("niche_actions").select("action").eq("niche_cluster_id", nicheClusterId);
  if (error) throw new Error(`countActionsByCluster: ${error.message}`);
  const out: Record<NicheActionType, number> = { viewed: 0, investigated: 0, generated_from: 0, dismissed: 0, hidden: 0 };
  for (const r of (data ?? []) as Array<{ action: NicheActionType }>) out[r.action]++;
  return out;
}
