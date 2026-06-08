// src/lib/agents/longform/style-picker.ts
import { z } from "zod";
import { generateObject, NoObjectGeneratedError } from "ai";
import { getClaudeModel } from "@/lib/ai/gateway";
import { getStylePreset, type StyleBible } from "@/lib/longform/style-presets";
import type { LongformPlaybook } from "@/lib/agents/longform/playbook";

/**
 * The ONLY presets the auto picker may choose — all proven, all high-quality
 * (nano_banana_2 / gpt_image_2), all illustrated. The photoreal soul_v2 presets
 * (cinematic-realistic, editorial-graphic) are deliberately excluded from auto;
 * they stay in STYLE_PRESETS so the Lab can still force them.
 */
export const AUTO_ELIGIBLE_PRESETS = [
  "naturalist-illustration",
  "technical-illustration",
  "stick-figure-animated",
] as const;

/** Proven default + fallback: the inked/watercolor field-guide look that worked. */
export const DEFAULT_AUTO_PRESET: StyleBible["presetId"] = "naturalist-illustration";

const AutoStylePickerOutputSchema = z.object({
  presetId: z.enum(AUTO_ELIGIBLE_PRESETS),
  musicMood: z.string().min(3).max(160),
  rationale: z.string().min(20).max(500),
});

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

The house look is ALWAYS hand-illustrated — never photoreal footage. Choose the best-fitting illustrated style:
- "naturalist-illustration": detailed inked + soft-watercolor field-guide / storybook illustration. The DEFAULT. Best for nature, animals, science, history, human-interest, and most factual topics.
- "technical-illustration": clean illustrated cutaway / labeled diagram. Best for engineering, machines, products, anatomy, "how it works".
- "stick-figure-animated": crude hand-drawn whiteboard stick-figure doodles. Best for playful, relatable, funny explainers about everyday life, psychology, or habits.

When unsure, choose "naturalist-illustration".

Also choose a short MUSIC MOOD phrase for a subtle, low-energy bed that sits well under the narration.

Return JSON: { "presetId": "naturalist-illustration" | "technical-illustration" | "stick-figure-animated", "musicMood": string, "rationale": string }.`;
}

async function callOnce(prompt: string): Promise<z.infer<typeof AutoStylePickerOutputSchema>> {
  const result = await generateObject({ model: getClaudeModel("claude-haiku-4-5"), schema: AutoStylePickerOutputSchema, prompt });
  return AutoStylePickerOutputSchema.parse(result.object);
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
      return resolve(DEFAULT_AUTO_PRESET, getStylePreset(DEFAULT_AUTO_PRESET).musicMood, "fallback: default illustrated preset");
    }
  }
}
