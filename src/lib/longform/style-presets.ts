// src/lib/longform/style-presets.ts
// The two L1 visual style presets. A StyleBible locks the aesthetic for an entire
// video so every beat image reads as one film. Consistency lever (per reference #1):
// a heavy reused positivePrefix + a long negativePrompt, no per-image randomness.
// Mirrored into the worker is NOT needed (the agent bakes the final prompt into the plan).

export const PRESET_IDS = ["cinematic-realistic", "editorial-graphic"] as const;
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
};

export function getStylePreset(id: PresetId): StyleBible {
  const preset = STYLE_PRESETS[id];
  if (!preset) throw new Error(`unknown style preset: ${id}`);
  return preset;
}
