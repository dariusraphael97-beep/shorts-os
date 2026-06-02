// src/lib/longform/style-presets.ts
// The L1 visual style presets. A StyleBible locks the aesthetic for an entire
// video so every beat image reads as one film. Consistency lever (per reference #1):
// a heavy reused positivePrefix + a long negativePrompt, no per-image randomness.
// Mirrored into the worker is NOT needed (the agent bakes the final prompt into the plan).
//
// NOTE on negatives: Soul V2 and GPT Image 2 both have NO negative-prompt CLI param, so the
// negativePrompt is stored for the plan/flywheel but is NOT sent at render time. Any suppressor
// that must actually bite (e.g. "no collage", or the stickman "do not make it look good") is
// folded into the POSITIVE positivePrefix instead.

export const PRESET_IDS = ["cinematic-realistic", "editorial-graphic", "stick-figure-animated"] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export interface StyleBible {
  presetId: PresetId;
  /** Locked aesthetic terms prepended to every beat prompt. */
  positivePrefix: string;
  /** Long suppression list — the main cross-image consistency lever. */
  negativePrompt: string;
  lighting: string;
  palette: string;
  framing: string;
  aspect: "16:9";
  /** Ken-Burns push amount (fraction of frame) per beat for this style. */
  kenBurnsZoom: number;
  /** Per-style beat cadence target (seconds of narration per image). */
  targetBeatSeconds: number;
  /** Default music mood for the bed (Style-picker may override within the preset). */
  musicMood: string;
}

const NEG_COMMON =
  "no text, no watermark, no logo, no caption, no subtitles, no signature, " +
  "no border, no frame, no split screen, no collage, no extra limbs, " +
  "no deformed hands, no extra fingers, no distorted faces, low quality, blurry, jpeg artifacts";

export const STYLE_PRESETS: Record<PresetId, StyleBible> = {
  "cinematic-realistic": {
    presetId: "cinematic-realistic",
    positivePrefix:
      "ultra-detailed photoreal cinematic still, 35mm film look, shallow depth of field, " +
      "dramatic single-source lighting, volumetric haze, filmic teal-and-amber color grade, " +
      "high dynamic range, subtle film grain, centered composition",
    negativePrompt: `${NEG_COMMON}, cartoon, illustration, flat vector, anime, painting, 3d render look`,
    lighting: "dramatic single-source key light, deep shadows, gentle rim light, god-rays where natural",
    palette: "moody high-contrast teal-and-amber; warm tungsten interiors, cool teal exteriors, deep blacks",
    framing: "wide cinematic establishing shots and dramatic close-ups, subject centered, strong negative space",
    aspect: "16:9",
    kenBurnsZoom: 0.06,
    targetBeatSeconds: 4.5,
    musicMood: "cinematic, dramatic, suspenseful, low-energy orchestral bed",
  },
  "editorial-graphic": {
    presetId: "editorial-graphic",
    positivePrefix:
      "bold modern editorial illustration, clean flat vector shapes, confident thick linework, " +
      "limited high-contrast palette, strong geometric composition, dramatic flat lighting, " +
      "magazine-grade infographic clarity, centered subject",
    negativePrompt: `${NEG_COMMON}, photorealistic, 3d render, busy background, gradient mesh, cluttered detail`,
    lighting: "flat dramatic lighting, bold shadow shapes, no photographic shading",
    palette: "limited high-contrast editorial palette: one accent color over a neutral ground",
    framing: "single clear focal subject, generous negative space, poster-like centering",
    aspect: "16:9",
    kenBurnsZoom: 0.03,
    targetBeatSeconds: 3.5,
    musicMood: "clean, driving, understated electronic bed, low-energy",
  },
  // Crude hand-drawn stickman doodles (YouTuber Zenn look) — captured verbatim from Danny's
  // "recreate Zenn" tutorial in docs/longform/zenn-style-image-prompt.md. Renders with GPT Image 2
  // (gpt_image_2, low/2k), NOT Soul V2 (Soul V2 makes broken stickmen — tested & rejected). The
  // negatives ("no 3d…", "do not make it look good") are baked into positivePrefix because neither
  // model accepts a negative-prompt param — that's also literally how Danny's prompt works.
  "stick-figure-animated": {
    presetId: "stick-figure-animated",
    positivePrefix:
      "crude hand-drawn doodle that looks like an extremely simple beginner MS Paint drawing made " +
      "quickly by someone who is not good at drawing, simple stickman childish drawing style, " +
      "pure white background, thick uneven black outlines, wobbly hand-drawn lines, " +
      "stick figure people with round heads and thin straight line bodies, simple dot eyes, " +
      "very basic facial expressions, flat solid colors only, no realistic shading, no 3D, " +
      "no cinematic lighting, no realistic cartoon style, no Disney style, no anime style, " +
      "no photorealism, do not make it look good, polished, or professional",
    negativePrompt: `${NEG_COMMON}, realistic shading, 3d render, cinematic lighting, photorealistic, ` +
      `realistic cartoon, disney style, anime, gradient shading, fine detail, professional illustration, painterly`,
    lighting: "completely flat, no shading, no lighting effects",
    palette: "flat solid marker-fill colors, only a few basic colors, no gradients",
    framing:
      "one single clear and simple scene that literally shows what is being said at this moment, " +
      "one or two subjects centered with plenty of empty white space, " +
      "never a collage, never a grid, never multiple panels",
    aspect: "16:9",
    kenBurnsZoom: 0.03,
    targetBeatSeconds: 4,
    musicMood: "light, quirky, playful, low-energy background bed",
  },
};

export function getStylePreset(id: PresetId): StyleBible {
  const preset = STYLE_PRESETS[id];
  if (!preset) throw new Error(`unknown style preset: ${id}`);
  return preset;
}
