// src/lib/agents/voice-coach.ts
//
// The Voice Coach agent: picks ONE voice from the curated VOICE_POOL plus
// speed + stability settings. Does NOT actually call Cartesia/ElevenLabs —
// Plan #4 wires the audio synthesis. Uses Claude Haiku.

import "server-only";
import { generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { getClaudeModel } from "@/lib/ai/gateway";
import { VOICE_POOL, VOICE_POOL_IDS, VOICE_PROVIDERS } from "./constants";
import type { Channel } from "@/lib/supabase/repositories/channels";
import type { QueuedTopic } from "@/lib/supabase/repositories/topic-queue";
import type { Job } from "@/lib/supabase/repositories/jobs";
import type { StrategistOutput } from "./strategist";
import type { WriterOutput } from "./writer";

export const VoiceCoachOutputSchema = z.object({
  voice_id: z.enum(VOICE_POOL_IDS),
  provider: z.enum([...VOICE_PROVIDERS]),
  speed: z.number().min(0.8).max(1.2),
  stability: z.number().min(0).max(1),
  rationale: z.string().min(20).max(400),
  fallback: z.boolean().optional(),
});
export type VoiceCoachOutput = z.infer<typeof VoiceCoachOutputSchema>;

export type VoiceCoachRunContext = {
  job: Job;
  topic: QueuedTopic;
  channel: Channel;
  previousOutputs: { strategist: StrategistOutput; writer: WriterOutput };
};

export async function runVoiceCoach(ctx: VoiceCoachRunContext): Promise<VoiceCoachOutput> {
  const prompt = buildPrompt(ctx);

  try {
    return await callOnce(prompt);
  } catch (err) {
    if (!NoObjectGeneratedError.isInstance(err)) throw err;

    try {
      return await callOnce(prompt);
    } catch (retryErr) {
      if (!NoObjectGeneratedError.isInstance(retryErr)) throw retryErr;
      return buildFallback(ctx, retryErr);
    }
  }
}

async function callOnce(prompt: string): Promise<VoiceCoachOutput> {
  const result = await generateObject({
    model: getClaudeModel("claude-haiku-4-5"),
    schema: VoiceCoachOutputSchema,
    prompt,
  });
  return VoiceCoachOutputSchema.parse(result.object);
}

function buildFallback(ctx: VoiceCoachRunContext, cause: NoObjectGeneratedError): VoiceCoachOutput {
  const { default_voice_id, default_tts_provider } = ctx.channel;
  if (!default_voice_id || !default_tts_provider) {
    throw new Error(
      `Voice Coach generateObject failed twice and channel ${ctx.channel.id} has no default_voice_id/default_tts_provider — channel misconfigured. Last cause: ${cause.message}`,
    );
  }
  const parsed = VoiceCoachOutputSchema.safeParse({
    voice_id: default_voice_id,
    provider: default_tts_provider,
    speed: 1.0,
    stability: 0.75,
    rationale: "Fallback: Voice Coach generateObject failed twice; using channel default voice.",
    fallback: true,
  });
  if (!parsed.success) {
    throw new Error(
      `Voice Coach fallback for channel ${ctx.channel.id} did not match VoiceCoachOutputSchema (default_voice_id=${default_voice_id}): ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

function buildPrompt(ctx: VoiceCoachRunContext): string {
  return `You are The Voice Coach. Pick ONE voice from the pool below for this script.

Script:
${ctx.previousOutputs.writer.script}

Channel persona:
${JSON.stringify(ctx.channel.persona, null, 2)}

Voice pool (you must pick a voice_id from this list — no others are valid):
${VOICE_POOL.map((v) => `- ${v.id} (${v.provider}): ${v.description}`).join("\n")}

Pick the voice_id that best matches script tone (urgency, sincerity, humor) and channel persona.
Set speed (0.8–1.2; 1.0 is normal pace) and stability (0–1; lower = more expressive, higher = more consistent).
Explain your pick in 1-2 sentences.`;
}
