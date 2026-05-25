import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ObservationSource = "youtube" | "tiktok" | "reddit" | "instagram";

export type ViralObservation = {
  id: string;
  niche_id: string | null;
  source: ObservationSource;
  external_id: string;
  url: string;
  title: string | null;
  channel_name: string | null;
  channel_id: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  duration_seconds: number | null;
  observed_at: string;
  views_at_observation: number | null;
  hook_text: string | null;
  raw_payload: unknown;
};

export async function listRecentObservations(
  supabase: SupabaseClient,
  opts: { limit?: number; sources?: ObservationSource[] } = {},
): Promise<ViralObservation[]> {
  const { limit = 25, sources } = opts;
  let q = supabase.from("viral_observations").select("*");
  if (sources && sources.length > 0) {
    q = q.in("source", sources);
  }
  const { data, error } = await q.order("observed_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`listRecentObservations: ${error.message}`);
  return (data ?? []) as ViralObservation[];
}
