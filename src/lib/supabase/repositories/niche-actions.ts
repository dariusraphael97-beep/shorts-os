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
  });
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

/** Recent raw actions across clusters (for admin correlation; aggregate in pure code). */
export async function listRecentNicheActions(
  supabase: SupabaseClient,
  limit = 1000,
): Promise<Array<{ niche_cluster_id: string; action: NicheActionType }>> {
  const { data, error } = await supabase
    .from("niche_actions")
    .select("niche_cluster_id, action")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listRecentNicheActions: ${error.message}`);
  return (data ?? []) as Array<{ niche_cluster_id: string; action: NicheActionType }>;
}
