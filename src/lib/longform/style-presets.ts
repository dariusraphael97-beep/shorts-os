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
  // Clean simple hand-drawn doodles (YouTuber Zenn look). v1 over-cooked the "bad MS Paint" angle —
  // re-watching Zenn (youtube st_Ah6Ykbh4) shows it is SIMPLE but CLEAN: smooth confident black ink
  // lines, expressive minimal faces (eyebrows, glasses, hair, real emotion), flat colors, and often a
  // simple COLORED setting (a room, sky-over-ground, an object), not bare white. Renders with GPT Image
  // 2 (gpt_image_2, low/2k), NOT Soul V2. Style suppressors are baked into positivePrefix because
  // neither model accepts a negative-prompt param.
  "stick-figure-animated": {
    presetId: "stick-figure-animated",
    positivePrefix:
      "a clean simple hand-drawn doodle in the style of a minimalist 2D explainer cartoon, " +
      "smooth confident black ink outlines of even weight, friendly round-headed stick figures with " +
      "simple but expressive faces (dot or oval eyes, eyebrows, a mouth that clearly shows the emotion), " +
      "flat solid colors, bold and uncluttered, easy to read at a glance, " +
      "no photorealism, no 3D, no realistic shading or gradients, no anime, no fine rendered detail",
    negativePrompt: `${NEG_COMMON}, realistic shading, 3d render, cinematic lighting, photorealistic, ` +
      `anime, gradient shading, busy cluttered detail, painterly, sketchy crosshatching`,
    lighting: "flat, no realistic shading, no gradients",
    palette: "a small set of flat, solid, bright colors, clean fills",
    framing:
      "one single clear and simple scene that literally shows what is being said at this moment, " +
      "drawn in a simple setting / environment that fits the moment (e.g. a room, outdoors with a ground " +
      "line and sky, or a single clear object) on a flat solid background color when the scene has a place, " +
      "otherwise a clean plain background; one or two subjects, centered, easy to read; " +
      "never a collage, never a grid, never multiple panels",
    aspect: "16:9",
    kenBurnsZoom: 0, // static hold — Zenn doesn't pan; avoids the zoompan jitter on clean line art
    targetBeatSeconds: 4,
    musicMood: "light, quirky, playful, low-energy background bed",
  },
};

export function getStylePreset(id: PresetId): StyleBible {
  const preset = STYLE_PRESETS[id];
  if (!preset) throw new Error(`unknown style preset: ${id}`);
  return preset;
}
