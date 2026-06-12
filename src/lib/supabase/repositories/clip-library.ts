import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SourcePlatform = "youtube" | "tiktok" | "reddit" | "twitch" | "upload";
export type AddedBy = "reddit_ingest" | "manual" | "deleted";

export interface ClipLibraryRow {
  id: string;
  source_url: string;
  source_platform: SourcePlatform;
  source_creator: string | null;
  local_path: string;
  duration_seconds: number;
  width: number | null;
  height: number | null;
  description: string | null;
  tags: string[];
  niche_id: string | null;
  added_at: string;
  added_by: string;
}

export interface ClipLibraryInsert {
  source_url: string;
  source_platform: SourcePlatform;
  source_creator: string | null;
  local_path: string;
  duration_seconds: number;
  width: number | null;
  height: number | null;
  description: string | null;
  tags: string[];
  niche_id: string | null;
  added_by: AddedBy;
}

export async function isSourceUrlIngested(
  supabase: SupabaseClient,
  sourceUrl: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("clip_library")
    .select("id")
    .eq("source_url", sourceUrl)
    .maybeSingle();
  if (error) throw new Error(`isSourceUrlIngested: ${error.message}`);
  return !!data;
}

export async function insertClipLibraryRow(
  supabase: SupabaseClient,
  row: ClipLibraryInsert,
): Promise<string> {
  const { data, error } = await supabase
    .from("clip_library")
    .insert(row)
    .select("id")
    .single();
  if (error) throw new Error(`insertClipLibraryRow: ${error.message}`);
  return data.id as string;
}

export async function countTodayClipIngestJobs(
  supabase: SupabaseClient,
  args: { channelId: string },
): Promise<number> {
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("render_jobs")
    .select("id", { count: "exact", head: true })
    .eq("job_type", "clip_ingest")
    .gte("created_at", sinceIso)
    .filter("payload->>channel_id", "eq", args.channelId);
  if (error) throw new Error(`countTodayClipIngestJobs: ${error.message}`);
  return count ?? 0;
}
