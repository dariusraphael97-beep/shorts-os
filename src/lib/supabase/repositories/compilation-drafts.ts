import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type DraftStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "rendering"
  | "rendered"
  | "posted"
  | "failed";

export type RevealPattern = "chronological" | "dramatic" | "reverse_rank";
export type CaptionStyle = "descriptive" | "reactive" | "mixed";
export type LayoutVariant = "top5_sidebar" | "top5_overlay";

export interface ClipRef {
  clip_id: string;
  start_sec: number;
  end_sec: number;
  label: string;
  order: number;
}

export interface CompilationDraftInsert {
  channel_id: string;
  topic_queue_id: string | null;
  theme: string;
  title_template: string;
  accent_word: string;
  title_formula_id: string;
  reveal_pattern: RevealPattern;
  caption_style: CaptionStyle;
  layout_variant: LayoutVariant;
  clip_refs: ClipRef[];
  music_track_id: string | null;
}

export interface CompilationDraftRow extends CompilationDraftInsert {
  id: string;
  status: DraftStatus;
  rendered_path: string | null;
  promoted_your_video_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecentPattern {
  title_formula_id: string;
  reveal_pattern: RevealPattern;
  caption_style: CaptionStyle;
  music_track_id: string | null;
}

export async function insertCompilationDraft(
  supabase: SupabaseClient,
  row: CompilationDraftInsert,
): Promise<string> {
  const { data, error } = await supabase
    .from("compilation_drafts")
    .insert({ ...row, status: "proposed" as DraftStatus })
    .select("id")
    .single();
  if (error) throw new Error(`insertCompilationDraft: ${error.message}`);
  return data.id as string;
}

export async function listRecentPatterns(
  supabase: SupabaseClient,
  args: { channelId: string; limit?: number },
): Promise<RecentPattern[]> {
  const { data, error } = await supabase
    .from("compilation_drafts")
    .select("title_formula_id,reveal_pattern,caption_style,music_track_id")
    .eq("channel_id", args.channelId)
    .in("status", ["posted", "rendered"])
    .order("updated_at", { ascending: false })
    .limit(args.limit ?? 5);
  if (error) throw new Error(`listRecentPatterns: ${error.message}`);
  return (data ?? []) as RecentPattern[];
}
