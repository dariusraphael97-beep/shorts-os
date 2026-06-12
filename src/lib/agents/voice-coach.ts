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

// --- Longform voice selection (reuses the shared voice pool + retry/fallback) ---
import type { LongformPlaybook } from "@/lib/agents/longform/playbook";

export const LongformVoiceSchema = z.object({
  voiceId: z.enum(VOICE_POOL_IDS),
  provider: z.enum([...VOICE_PROVIDERS]),
  speed: z.number().min(0.8).max(1.1),
  stability: z.number().min(0).max(1),
  rationale: z.string().min(10).max(400),
});
export type LongformVoiceOutput = z.infer<typeof LongformVoiceSchema>;

export interface LongformVoiceArgs {
  topic: string;
  narrationSample: string;
  playbook: LongformPlaybook;
  /** Style preset — steers the narrator tone (dramatic doc vs warm conversational doodle). */
  presetId?: string;
}

// Authoritative narrator default (Ronald — Thinker: intense, deep, dramatic weight).
const LONGFORM_DEFAULT_VOICE_ID = "5ee9feff-1265-424a-9d7f-8e4d431a12c7";
// Conversational default (Jameson — Easygoing Support: friendly, laid-back, podcast-style).
const LONGFORM_CONVERSATIONAL_VOICE_ID = "a5136bf9-224c-4d76-b823-52bd5efcffcc";

function buildLongformVoicePrompt(args: LongformVoiceArgs): string {
  const styleGuidance =
    args.presetId === "stick-figure-animated"
      ? `This is a RELATABLE, friendly explainer told over simple hand-drawn doodles — NOT a dramatic
movie-trailer. Prefer a WARM, NATURAL, CONVERSATIONAL human voice that sounds like a real person casually
explaining something interesting to a friend. Avoid intense or heavy "narrator" voices. Choose a speed
between 0.95 and 1.05 (natural, easy pace) and a LOWER stability (more expressive, less robotic).`
      : `This is measured, authoritative, suspense-building narration (NOT hype). Prefer a deep, steady, dramatic voice;
choose a speed between 0.90 and 1.00 (measured pacing with room for pauses).`;
  return `You are the Voice Coach for a faceless longform video. Pick ONE narrator voice from the pool.
${styleGuidance}

Topic: "${args.topic}"
Narration sample:
${args.narrationSample.slice(0, 600)}

Voice pool (pick a voiceId from this list only):
${VOICE_POOL.map((v) => `- ${v.id} (${v.provider}): ${v.description}`).join("\n")}

Return JSON: { "voiceId", "provider", "speed", "stability", "rationale" }.`;
}

async function callLongformVoiceOnce(prompt: string): Promise<LongformVoiceOutput> {
  const result = await generateObject({ model: getClaudeModel("claude-haiku-4-5"), schema: LongformVoiceSchema, prompt });
  return LongformVoiceSchema.parse(result.object);
}

export async function pickLongformVoice(args: LongformVoiceArgs): Promise<LongformVoiceOutput> {
  const prompt = buildLongformVoicePrompt(args);
  try {
    return await callLongformVoiceOnce(prompt);
  } catch (err) {
    if (!NoObjectGeneratedError.isInstance(err)) throw err;
    try {
      return await callLongformVoiceOnce(prompt);
    } catch (retryErr) {
      if (!NoObjectGeneratedError.isInstance(retryErr)) throw retryErr;
      return args.presetId === "stick-figure-animated"
        ? { voiceId: LONGFORM_CONVERSATIONAL_VOICE_ID, provider: "cartesia", speed: 1.0, stability: 0.4, rationale: "fallback: default conversational narrator" }
        : { voiceId: LONGFORM_DEFAULT_VOICE_ID, provider: "cartesia", speed: 0.95, stability: 0.6, rationale: "fallback: default authoritative narrator" };
    }
  }
}

function buildPrompt(ctx: VoiceCoachRunContext): string {
  return `You are The Voice Coach. Pick ONE voice from the pool below for this script.

Script:
${ctx.previousOutputs.writer.script}

Channel persona:
${JSON.stringify(ctx.channel.persona, null, 2)}

Channel default voice_id: ${ctx.channel.default_voice_id ?? "(none)"}

Voice pool (you must pick a voice_id from this list — no others are valid):
${VOICE_POOL.map((v) => `- ${v.id} (${v.provider}): ${v.description}`).join("\n")}

DECISION RULE:
- Default strongly to the channel default voice_id. In ~95% of cases, the channel default IS the right pick.
- Only deviate when the script's tone EXPLICITLY demands a different voice — e.g., a dramatic crash/disaster story may warrant the dramatic-deep voice, a high-energy hype piece may warrant the energetic voice.
- A passing reference to "drama" or "energy" in the script is NOT enough — the script's overall tone has to genuinely match a non-default voice better than the default.

Set speed (0.8–1.2; 1.0 is normal pace) and stability (0–1; lower = more expressive, higher = more consistent).
Explain your pick in 1-2 sentences. If you picked the channel default, say so; if you deviated, name the specific tonal cue in the script that triggered the override.`;
}
