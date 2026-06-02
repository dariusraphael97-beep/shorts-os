// src/lib/agents/longform/style-picker.ts
import { generateObject, NoObjectGeneratedError } from "ai";
import { getClaudeModel } from "@/lib/ai/gateway";
import { getStylePreset, PRESET_IDS, type StyleBible } from "@/lib/longform/style-presets";
import { StylePickerOutputSchema } from "@/lib/agents/longform/types";
import type { LongformPlaybook } from "@/lib/agents/longform/playbook";

export interface StylePickerRunContext {
  topic: string;
  angle: string;
  playbook: LongformPlaybook;
}

export interface StylePickerResult {
  presetId: StyleBible["presetId"];
  musicMood: string;
  rationale: string;
  styleBible: StyleBible;
}

function buildPrompt(ctx: StylePickerRunContext): string {
  return `You are the Style Picker for a faceless longform documentary. Choose ONE visual style for the WHOLE video.
Topic: "${ctx.topic}"
Angle: "${ctx.angle}"

Options:
- "cinematic-realistic": photoreal cinematic footage, teal/amber dramatic grade. Best for history, true-story, immersive, science-mystery, human-interest.
- "editorial-graphic": bold flat editorial illustration. Best for finance, economics, tech, abstract/explainer topics where photoreal footage would look generic.
- "stick-figure-animated": crude hand-drawn MS-Paint stick-figure doodles (YouTuber Zenn style) — one simple whiteboard sketch per beat. Best for playful, relatable, funny explainers about everyday life, psychology, habits, or "history of an ordinary thing" told in a light way.

Also choose a short MUSIC MOOD phrase for a subtle, low-energy bed that sits well under the narration.

Return JSON: { "presetId": "cinematic-realistic" | "editorial-graphic" | "stick-figure-animated", "musicMood": string, "rationale": string }.`;
}

async function callOnce(prompt: string): Promise<{ presetId: StyleBible["presetId"]; musicMood: string; rationale: string }> {
  const result = await generateObject({ model: getClaudeModel("claude-haiku-4-5"), schema: StylePickerOutputSchema, prompt });
  return StylePickerOutputSchema.parse(result.object);
}

function resolve(presetId: StyleBible["presetId"], musicMood: string, rationale: string): StylePickerResult {
  const base = getStylePreset(presetId);
  return { presetId, musicMood, rationale, styleBible: { ...base, musicMood } };
}

export async function runStylePicker(ctx: StylePickerRunContext): Promise<StylePickerResult> {
  const prompt = buildPrompt(ctx);
  try {
    const out = await callOnce(prompt);
    return resolve(out.presetId, out.musicMood, out.rationale);
  } catch (err) {
    if (!NoObjectGeneratedError.isInstance(err)) throw err;
    try {
      const out = await callOnce(prompt);
      return resolve(out.presetId, out.musicMood, out.rationale);
    } catch (retryErr) {
      if (!NoObjectGeneratedError.isInstance(retryErr)) throw retryErr;
      const fallback = PRESET_IDS[0]; // cinematic-realistic
      return resolve(fallback, getStylePreset(fallback).musicMood, "fallback: default cinematic preset");
    }
  }
}
