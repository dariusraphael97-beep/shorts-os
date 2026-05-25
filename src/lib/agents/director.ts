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

export const DirectorOutputSchema = z.object({
  visual_treatment: z.enum([...VISUAL_TREATMENTS]),
  music_mood: z.string().min(3).max(100),
  shot_list: z.array(ShotListEntrySchema).min(4).max(12),
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
  return `You are The Director. Pick ONE visual_treatment from the enum, decide a music mood, and produce a shot_list of 4–12 segments covering the full script.

Script:
${ctx.previousOutputs.writer.script}

Voice: ${ctx.previousOutputs.voiceCoach.voice_id} (use to inform pacing of cuts)
Channel persona:
${JSON.stringify(ctx.channel.persona, null, 2)}

Available visual treatments (pick exactly one):
${treatments}

Rules:
- Aim for 1 visual change every 3-5 seconds. Sum of duration_seconds should roughly match the script length (${ctx.previousOutputs.writer.estimated_duration_seconds.toFixed(0)}s).
- Each shot_list entry needs a broll_search_query of 3-6 words usable against Pexels/Storyblocks.
- segment_text should be the chunk of the script that plays during this shot.
- Explain your treatment choice in 1-3 sentences.`;
}
