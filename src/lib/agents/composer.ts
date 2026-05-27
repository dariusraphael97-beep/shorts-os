// src/lib/agents/composer.ts
//
// The Composer agent: produces a `compilation_drafts` row from a candidate
// pool of clip_library rows + a music_tracks pool. Called by the orchestrator
// on the compilation branch (selected_format='compilation') in place of
// Writer → Voice Coach → Director.

import "server-only";
import { generateObject } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getClaudeModel } from "@/lib/ai/gateway";
import type { Channel } from "@/lib/supabase/repositories/channels";
import type { QueuedTopic } from "@/lib/supabase/repositories/topic-queue";
import type { Job } from "@/lib/supabase/repositories/jobs";
import type { StrategistOutput } from "./strategist";
import {
  listRecentPatterns,
  insertCompilationDraft,
  type RecentPattern,
} from "@/lib/supabase/repositories/compilation-drafts";

export const ComposerOutputSchema = z.object({
  title_template: z.string().min(8).max(60),
  accent_word: z.string().min(2).max(20),
  title_formula_id: z.enum([
    "ranking_best",
    "top_5",
    "you_wont_believe",
    "when_gone_wrong",
    "gone_wrong",
    "my_favorite",
    "reacting_to",
  ]),
  reveal_pattern: z.enum(["chronological", "dramatic", "reverse_rank"]),
  caption_style: z.enum(["descriptive", "reactive", "mixed"]),
  layout_variant: z.enum(["top5_sidebar", "top5_overlay"]),
  clip_refs: z
    .array(
      z.object({
        clip_id: z.string().uuid(),
        start_sec: z.number().min(0),
        end_sec: z.number().min(0),
        label: z.string().min(2).max(80),
        order: z.number().int().min(1).max(5),
      }),
    )
    .length(5),
  music_track_id: z.string().uuid(),
  rationale: z.string().min(10).max(800),
});
export type ComposerOutput = z.infer<typeof ComposerOutputSchema>;

export interface CandidateClip {
  id: string;
  description: string | null;
  tags: string[];
  duration_seconds: number;
}

export interface CandidateMusic {
  id: string;
  title: string;
  genre: string | null;
  energy_level: number | null;
}

export async function fetchCandidatePool(
  supabase: SupabaseClient,
  args: { nicheId: string; channelId: string; tagKeywords: string[] },
): Promise<CandidateClip[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: recentDrafts, error: recentErr } = await supabase
    .from("compilation_drafts")
    .select("clip_refs")
    .eq("channel_id", args.channelId)
    .gte("updated_at", sevenDaysAgo)
    .in("status", ["proposed", "approved", "rendering", "rendered", "posted"]);
  if (recentErr) throw new Error(`fetchCandidatePool/recent: ${recentErr.message}`);

  const usedClipIds = new Set<string>();
  for (const d of (recentDrafts ?? []) as Array<{ clip_refs: Array<{ clip_id: string }> }>) {
    for (const r of d.clip_refs ?? []) usedClipIds.add(r.clip_id);
  }

  let q = supabase
    .from("clip_library")
    .select("id,description,tags,duration_seconds")
    .eq("niche_id", args.nicheId)
    .neq("added_by", "deleted")
    .gte("added_at", thirtyDaysAgo);
  if (args.tagKeywords.length > 0) q = q.overlaps("tags", args.tagKeywords);
  const { data, error } = await q.limit(30);
  if (error) throw new Error(`fetchCandidatePool: ${error.message}`);
  return ((data ?? []) as CandidateClip[]).filter((c) => !usedClipIds.has(c.id));
}

export async function fetchMusicPool(supabase: SupabaseClient): Promise<CandidateMusic[]> {
  const { data, error } = await supabase
    .from("music_tracks")
    .select("id,title,genre,energy_level")
    .eq("requires_attribution", false)
    .in("energy_level", [2, 3])
    .order("added_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`fetchMusicPool: ${error.message}`);
  return (data ?? []) as CandidateMusic[];
}

export interface ComposerContext {
  job: Job;
  topic: QueuedTopic;
  channel: Channel & { niche_id: string | null };
  strategist: StrategistOutput;
  supabase: SupabaseClient;
}

export interface ComposerResult {
  output: ComposerOutput;
  draftId: string;
  fallbackUsed: boolean;
}

export async function runComposer(ctx: ComposerContext): Promise<ComposerResult> {
  if (!ctx.channel.niche_id) throw new Error("composer: channel.niche_id missing");

  const tagKeywords = (ctx.strategist.format_hints ?? []).slice(0, 5);
  const [candidates, music, recentPatterns] = await Promise.all([
    fetchCandidatePool(ctx.supabase, {
      nicheId: ctx.channel.niche_id,
      channelId: ctx.channel.id,
      tagKeywords,
    }),
    fetchMusicPool(ctx.supabase),
    listRecentPatterns(ctx.supabase, { channelId: ctx.channel.id, limit: 5 }),
  ]);

  if (candidates.length < 5) {
    throw new Error(`composer: not enough candidates (${candidates.length} < 5)`);
  }
  if (music.length < 1) {
    throw new Error("composer: no music tracks available");
  }

  const prompt = buildPrompt({
    candidates,
    music,
    recentPatterns,
    strategist: ctx.strategist,
    topic: ctx.topic,
  });

  let output: ComposerOutput;
  let fallbackUsed = false;
  try {
    output = await callAndValidate(prompt, candidates, music, recentPatterns);
  } catch {
    try {
      const retryPrompt =
        prompt +
        "\n\nThe previous attempt failed validation. Be stricter about: 5 clips, each 4–9s long, total 25–35s, music_track_id MUST be from the supplied list, and your pattern MUST differ from each recent on at least 3 of 4 axes.";
      output = await callAndValidate(retryPrompt, candidates, music, recentPatterns);
    } catch {
      output = heuristicFallback(candidates, music);
      fallbackUsed = true;
    }
  }

  const draftId = await insertCompilationDraft(ctx.supabase, {
    channel_id: ctx.channel.id,
    topic_queue_id: ctx.topic.id,
    theme: ctx.strategist.dispatch_directive.slice(0, 200),
    title_template: output.title_template,
    accent_word: output.accent_word,
    title_formula_id: output.title_formula_id,
    reveal_pattern: output.reveal_pattern,
    caption_style: output.caption_style,
    layout_variant: output.layout_variant,
    clip_refs: output.clip_refs,
    music_track_id: output.music_track_id,
  });

  return { output, draftId, fallbackUsed };
}

async function callAndValidate(
  prompt: string,
  candidates: CandidateClip[],
  music: CandidateMusic[],
  recentPatterns: RecentPattern[],
): Promise<ComposerOutput> {
  const result = await generateObject({
    model: getClaudeModel("claude-haiku-4-5"),
    schema: ComposerOutputSchema,
    prompt,
  });
  const parsed = ComposerOutputSchema.parse(result.object);
  validatePostLLM(parsed, candidates, music, recentPatterns);
  return parsed;
}

function buildPrompt(args: {
  candidates: CandidateClip[];
  music: CandidateMusic[];
  recentPatterns: RecentPattern[];
  strategist: StrategistOutput;
  topic: QueuedTopic;
}): string {
  return `You are The Composer. Assemble a 5-clip Top-5 short.

THEME: ${args.strategist.dispatch_directive}
TOPIC: ${args.topic.title}

CANDIDATE CLIPS (pick exactly 5):
${args.candidates
  .map(
    (c) =>
      `[${c.id}] (${c.duration_seconds}s, tags=${c.tags.join(",")}): ${
        c.description?.slice(0, 200) ?? "(no description)"
      }`,
  )
  .join("\n")}

MUSIC TRACKS (pick one):
${args.music.map((m) => `[${m.id}] ${m.title} (${m.genre}, energy=${m.energy_level})`).join("\n")}

RECENT PATTERNS (last 5 channel uploads — your choice MUST differ on at least 3 of: title_formula_id, reveal_pattern, caption_style, music_track_id):
${
  args.recentPatterns.length === 0
    ? "(none)"
    : args.recentPatterns
        .map(
          (p, i) =>
            `${i + 1}. formula=${p.title_formula_id}, reveal=${p.reveal_pattern}, caption=${p.caption_style}, music=${p.music_track_id}`,
        )
        .join("\n")
}

CONSTRAINTS:
- Pick exactly 5 clips. Each segment 4–9s. Total 25–35s.
- music_track_id MUST be one of the IDs listed above.
- title_template ≤ 60 chars; accent_word ≤ 20 chars and appearing in title_template (case-insensitive).
- layout_variant: prefer top5_sidebar (4 of 5 times), occasionally top5_overlay.

Output JSON matching the schema.`;
}

export function validatePostLLM(
  output: ComposerOutput,
  candidates: CandidateClip[],
  music: CandidateMusic[],
  recentPatterns: RecentPattern[],
): void {
  const candidateIds = new Set(candidates.map((c) => c.id));
  const musicIds = new Set(music.map((m) => m.id));
  for (const ref of output.clip_refs) {
    if (!candidateIds.has(ref.clip_id)) throw new Error(`unknown clip_id ${ref.clip_id}`);
    const dur = ref.end_sec - ref.start_sec;
    if (dur < 4 || dur > 9) {
      throw new Error(`clip ${ref.clip_id} duration ${dur}s out of [4,9]`);
    }
  }
  const total = output.clip_refs.reduce((a, r) => a + (r.end_sec - r.start_sec), 0);
  if (total < 25 || total > 35) throw new Error(`total duration ${total}s out of [25,35]`);
  if (!musicIds.has(output.music_track_id)) {
    throw new Error(`unknown music_track_id ${output.music_track_id}`);
  }
  for (const p of recentPatterns) {
    let same = 0;
    if (p.title_formula_id === output.title_formula_id) same++;
    if (p.reveal_pattern === output.reveal_pattern) same++;
    if (p.caption_style === output.caption_style) same++;
    if (p.music_track_id === output.music_track_id) same++;
    if (same > 1) {
      throw new Error(`pattern diff insufficient (${4 - same}/4 different)`);
    }
  }
}

export function heuristicFallback(
  candidates: CandidateClip[],
  music: CandidateMusic[],
): ComposerOutput {
  const picked = candidates.slice(0, 5);
  const refs = picked.map((c, i) => {
    const dur = Math.max(4, Math.min(9, Math.floor(c.duration_seconds)));
    return {
      clip_id: c.id,
      start_sec: 0,
      end_sec: dur,
      label: `#${5 - i}`,
      order: i + 1,
    };
  });
  return {
    title_template: "TOP 5 MOMENTS",
    accent_word: "MOMENTS",
    title_formula_id: "top_5",
    reveal_pattern: "dramatic",
    caption_style: "mixed",
    layout_variant: "top5_sidebar",
    clip_refs: refs,
    music_track_id: music[0].id,
    rationale: "heuristic fallback: LLM output failed validation twice",
  };
}
