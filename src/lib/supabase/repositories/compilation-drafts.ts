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

const LEGAL_TRANSITIONS: Record<DraftStatus, DraftStatus[]> = {
  proposed: ["approved", "rejected"],
  approved: ["rendering", "failed"],
  rendering: ["rendered", "failed"],
  rendered: ["posted", "failed"],
  posted: [],
  rejected: [],
  failed: [],
};

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

export async function listProposedDrafts(
  supabase: SupabaseClient,
  args: { channelId?: string; limit?: number },
): Promise<CompilationDraftRow[]> {
  let q = supabase.from("compilation_drafts").select("*").eq("status", "proposed");
  if (args.channelId) q = q.eq("channel_id", args.channelId);
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(args.limit ?? 50);
  if (error) throw new Error(`listProposedDrafts: ${error.message}`);
  return (data ?? []) as CompilationDraftRow[];
}

export async function listRenderedDrafts(
  supabase: SupabaseClient,
  args: { channelId?: string; limit?: number },
): Promise<CompilationDraftRow[]> {
  let q = supabase.from("compilation_drafts").select("*").eq("status", "rendered");
  if (args.channelId) q = q.eq("channel_id", args.channelId);
  const { data, error } = await q
    .order("updated_at", { ascending: false })
    .limit(args.limit ?? 50);
  if (error) throw new Error(`listRenderedDrafts: ${error.message}`);
  return (data ?? []) as CompilationDraftRow[];
}

export async function getDraftById(
  supabase: SupabaseClient,
  id: string,
): Promise<CompilationDraftRow | null> {
  const { data, error } = await supabase
    .from("compilation_drafts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getDraftById: ${error.message}`);
  return (data as CompilationDraftRow | null) ?? null;
}

export async function updateDraftStatus(
  supabase: SupabaseClient,
  args: { id: string; from: DraftStatus; to: DraftStatus },
): Promise<void> {
  if (!LEGAL_TRANSITIONS[args.from].includes(args.to)) {
    throw new Error(`illegal draft transition ${args.from} → ${args.to}`);
  }
  const { error, count } = await supabase
    .from("compilation_drafts")
    .update(
      { status: args.to, updated_at: new Date().toISOString() },
      { count: "exact" },
    )
    .eq("id", args.id)
    .eq("status", args.from);
  if (error) throw new Error(`updateDraftStatus: ${error.message}`);
  if (count === 0) throw new Error(`draft ${args.id} not in status ${args.from}`);
}

export async function updateDraftClipRefs(
  supabase: SupabaseClient,
  args: { id: string; clip_refs: ClipRef[]; music_track_id?: string | null },
): Promise<void> {
  const patch: Record<string, unknown> = {
    clip_refs: args.clip_refs,
    updated_at: new Date().toISOString(),
  };
  if (args.music_track_id !== undefined) patch.music_track_id = args.music_track_id;
  const { error } = await supabase
    .from("compilation_drafts")
    .update(patch)
    .eq("id", args.id)
    .eq("status", "proposed");
  if (error) throw new Error(`updateDraftClipRefs: ${error.message}`);
}

export async function setRenderedPath(
  supabase: SupabaseClient,
  args: { id: string; rendered_path: string },
): Promise<void> {
  const { error } = await supabase
    .from("compilation_drafts")
    .update({
      rendered_path: args.rendered_path,
      status: "rendered",
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.id);
  if (error) throw new Error(`setRenderedPath: ${error.message}`);
}

export async function setPromotedYourVideoId(
  supabase: SupabaseClient,
  args: { id: string; your_video_id: string },
): Promise<void> {
  const { error } = await supabase
    .from("compilation_drafts")
    .update({
      promoted_your_video_id: args.your_video_id,
      status: "posted",
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.id);
  if (error) throw new Error(`setPromotedYourVideoId: ${error.message}`);
}

export async function getLatestCompilationDraftByTopic(
  supabase: SupabaseClient,
  topicId: string,
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("compilation_drafts")
    .select("id")
    .eq("topic_queue_id", topicId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getLatestCompilationDraftByTopic: ${error.message}`);
  return (data ?? null) as { id: string } | null;
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
