import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type DigestStatus = "sent" | "skipped" | "failed" | "preview";

export interface DigestRun {
  id: string;
  week_start: string;
  sent_at: string;
  recipient: string | null;
  status: DigestStatus;
  cluster_ids: string[];
  html: string | null;
  error: string | null;
}

// NOTE (Plan #5 Sub-phase E, Task 8): `digest_runs` is NOT yet in the generated
// `types.ts` because its migration has not been applied to prod (operator-gated;
// see the MORNING TODO in the Sub-phase E handoff note). The service-role client
// returned by `getServiceClient()` is the untyped `SupabaseClient`, so `.from()`
// accepts the not-yet-generated table name and these calls compile today. Once the
// migration is applied and `types.ts` is regenerated, nothing here needs to change.

export async function insertDigestRun(
  supabase: SupabaseClient,
  params: {
    weekStart: string;
    recipient: string | null;
    status: DigestStatus;
    clusterIds: string[];
    html: string | null;
    error?: string | null;
  },
): Promise<DigestRun> {
  const { data, error } = await supabase
    .from("digest_runs")
    .insert({
      week_start: params.weekStart,
      recipient: params.recipient,
      status: params.status,
      cluster_ids: params.clusterIds,
      html: params.html,
      error: params.error ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(`insertDigestRun: ${error.message}`);
  return data as DigestRun;
}

export async function listDigestRuns(supabase: SupabaseClient, limit: number): Promise<DigestRun[]> {
  const { data, error } = await supabase
    .from("digest_runs")
    .select()
    .order("sent_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listDigestRuns: ${error.message}`);
  return (data ?? []) as DigestRun[];
}

export async function getLatestDigestRun(supabase: SupabaseClient): Promise<DigestRun | null> {
  const { data, error } = await supabase
    .from("digest_runs")
    .select()
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && (error as { code?: string }).code !== "PGRST116") {
    throw new Error(`getLatestDigestRun: ${error.message}`);
  }
  return (data as DigestRun | null) ?? null;
}
