// src/lib/agents/director.ts
//
// The Director agent: picks ONE visual_treatment from the enum, decides
// a music mood, and produces a 4-12 segment shot_list with per-segment
// b-roll search queries that Plan #4 will run against Pexels/Storyblocks.
// Uses Claude Haiku.

import "server-only";
import { generateObject } from "ai";
import { z } from "zod";
import { getClaudeModel } from "@/lib/ai/gateway";
import { VISUAL_TREATMENTS, VISUAL_TREATMENT_DESCRIPTIONS } from "./constants";
import type { Channel } from "@/lib/supabase/repositories/channels";
import type { QueuedTopic } from "@/lib/supabase/repositories/topic-queue";
import type { Job } from "@/lib/supabase/repositories/jobs";
import type { StrategistOutput } from "./strategist";
import type { WriterOutput } from "./writer";
import type { VoiceCoachOutput } from "./voice-coach";

export const ShotListEntrySchema = z.object({
  segment_text: z.string().min(5).max(400),
  broll_search_query: z.string().min(3).max(120),
  duration_seconds: z.number().min(1).max(15),
});

// Add after the existing ShotListEntrySchema declaration
export const DirectorCaptionsPropsSchema = z.object({
  variant: z.enum(["word-by-word", "two-words-at-a-time", "rolling-line"]),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be #RRGGBB hex"),
  accent_word_policy: z.enum(["first-noun", "highlighted-by-director", "none"]),
  highlighted_words: z.array(z.string()).default([]),
  animation_speed: z.number().min(0.5).max(2.0).default(1.0),
  font_scale: z.number().min(0.7).max(1.5).default(1.0),
});

export const DirectorOutputSchema = z.object({
  visual_treatment: z.enum([...VISUAL_TREATMENTS]),
  music_mood: z.string().min(3).max(100),
  shot_list: z.array(ShotListEntrySchema).min(4).max(12),
  caption_props: DirectorCaptionsPropsSchema,
  rationale: z.string().min(20).max(600),
});
export type DirectorOutput = z.infer<typeof DirectorOutputSchema>;

export type DirectorRunContext = {
  job: Job;
  topic: QueuedTopic;
  channel: Channel;
  previousOutputs: {
    strategist: StrategistOutput;
    writer: WriterOutput;
    voiceCoach: VoiceCoachOutput;
  };
};

export async function runDirector(ctx: DirectorRunContext): Promise<DirectorOutput> {
  const prompt = buildPrompt(ctx);
  const result = await generateObject({
    model: getClaudeModel("claude-haiku-4-5"),
    schema: DirectorOutputSchema,
    prompt,
  });
  return DirectorOutputSchema.parse(result.object);
}

function buildPrompt(ctx: DirectorRunContext): string {
  const treatments = VISUAL_TREATMENTS.map(
    (t) => `- ${t}: ${VISUAL_TREATMENT_DESCRIPTIONS[t]}`,
  ).join("\n");
  return `You are The Director. Pick ONE visual_treatment from the enum, decide a music mood, produce a shot_list of 4–12 segments covering the full script, and pick caption_props for the kinetic-typography caption layer.

Script:
${ctx.previousOutputs.writer.script}

Voice: ${ctx.previousOutputs.voiceCoach.voice_id} (use to inform pacing of cuts)
Channel persona:
${JSON.stringify(ctx.channel.persona, null, 2)}

Available visual treatments (pick exactly one):
${treatments}

Rules for shot_list:
- Aim for 1 visual change every 3-5 seconds. Sum of duration_seconds should roughly match the script length (${ctx.previousOutputs.writer.estimated_duration_seconds.toFixed(0)}s).
- Each shot_list entry needs a broll_search_query of 3-6 words usable against Pexels/Storyblocks.
- segment_text should be the chunk of the script that plays during this shot.

CAPTION VARIANT GUIDANCE — pick ONE for caption_props.variant:

- 'word-by-word' (Phase 2.5 default): high-energy narration, hooks, dramatic
  moments, action sequences, surprise reveals. Words appear one at a time
  in sync with the voice. PHASE 2.5 ALWAYS PICKS THIS — the other two
  variants are scaffolded for future phases. If you're tempted to pick
  another, pick this and explain in rationale.

- 'two-words-at-a-time': conversational explainer pacing, mid-energy how-to
  content, comparison/contrast scripts. Lighter cognitive load than
  word-by-word; reads more naturally for instructional content.
  [SCAFFOLDED, not yet rendered]

- 'rolling-line': slower educational deep-dives, longer phrases that don't
  fragment well (technical terminology, quoted dialogue). A full line stays
  on screen and slides up as the next line arrives.
  [SCAFFOLDED, not yet rendered]

ACCENT-WORD POLICY — pick ONE for caption_props.accent_word_policy:

- 'first-noun': highlight the first concrete noun in each cue. Default for
  generic explainer content.
- 'highlighted-by-director': you explicitly name which words pop. Use when
  the script has obvious emphasis words ("FREE", "SHOCKING", "TESLA").
  Populate caption_props.highlighted_words with the words.
- 'none': no per-word emphasis; all words equal. Use for sober/serious
  topics (disaster, retrospective, memorial).

OTHER caption_props fields:
- accent_color: hex like "#FFD23F" (default warm yellow). Pick a color that
  contrasts with the b-roll palette implied by your shot_list.
- animation_speed: 0.5-2.0 (default 1.0). Slower for somber, faster for hype.
- font_scale: 0.7-1.5 (default 1.0). Larger for hook moments.

Always use Remotion best practices for caption motion design.

Explain your treatment choice + caption_props rationale in 1-3 sentences combined.`;
}
