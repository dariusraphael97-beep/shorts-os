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

export const PRESET_IDS = ["cinematic-realistic", "editorial-graphic", "stick-figure-animated", "naturalist-illustration", "technical-illustration"] as const;
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
  /** Higgsfield image model (job_set_type) this style renders with. */
  model: string;
  /** Extra model params beyond prompt+aspect (e.g. {quality,resolution}); model-specific. */
  imageParams: Record<string, string>;
  /** When true, the renderer first fetches a REAL reference photo of each beat's subject
   *  (Google image search) and draws from it, so parts are accurate to the real thing. */
  referenceDriven?: boolean;
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
    model: "text2image_soul_v2",
    imageParams: { quality: "2k" },
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
    model: "text2image_soul_v2",
    imageParams: { quality: "2k" },
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
    targetBeatSeconds: 2.5, // Zenn's cadence: a new image every 2-3 seconds (the real "secret")
    musicMood: "light, quirky, playful, low-energy background bed",
    model: "gpt_image_2",
    imageParams: { quality: "low", resolution: "2k" },
  },
  // Detailed naturalist storybook illustration — DETECTED from the winning backyard-bird channels
  // (yt _xftmgUhS7Q etc.): fine inked linework + crosshatching, soft muted watercolor fills, the
  // animal rendered realistically as the large hero subject, atmospheric natural backgrounds. The
  // right look for animal / nature / wildlife niches (NOT the Zenn doodle). High quality via Nano
  // Banana Pro. This is the first "Style-Scout-shaped" preset; the scout will generate these per-niche.
  "naturalist-illustration": {
    presetId: "naturalist-illustration",
    positivePrefix:
      "detailed naturalist storybook illustration, fine hand-inked linework with delicate crosshatching " +
      "and texture detail, soft muted watercolor fills, the subject rendered realistically and anatomically " +
      "accurate as the large central hero of the frame, atmospheric natural setting with real depth, " +
      "gentle ambient light, beautiful and polished, the look of a high-end illustrated field guide",
    negativePrompt: `${NEG_COMMON}, doodle, stick figure, childish drawing, flat vector, cartoon, ` +
      `3d render, photograph, low effort, sketchy`,
    lighting: "soft natural ambient light, gentle atmospheric glow, subtle depth",
    palette: "soft muted watercolor, warm earth tones with cool atmospheric accents",
    framing: "a single hero subject, large and centered, with an atmospheric natural background and cinematic depth",
    aspect: "16:9",
    kenBurnsZoom: 0, // static for now (no shake); smooth slow push is a later refinement
    targetBeatSeconds: 3.5,
    musicMood: "calm, atmospheric, gentle nature-documentary ambient bed",
    model: "nano_banana_2",
    imageParams: { resolution: "2k" },
  },
  // Illustrated technical CUTAWAY style for engineering / product / how-it-works niches (e.g. the
  // BMW B58 video). Hand-drawn field-guide look (NOT photoreal) so internals read clearly — but
  // REFERENCE-DRIVEN: the renderer pulls a real photo of each part and draws FROM it (via Nano
  // Banana's --image), so every component is accurate to the real thing.
  "technical-illustration": {
    presetId: "technical-illustration",
    positivePrefix:
      "a detailed hand-drawn technical illustration in a clean engineering field-guide / cutaway style, " +
      "fine inked linework with light shading and clear labels where helpful, the subject drawn accurately " +
      "from the reference photo with a partial cutaway revealing how it works, legible and uncluttered, " +
      "soft muted colors, clean light background — NOT a photograph, an illustration",
    negativePrompt: `${NEG_COMMON}, photograph, photorealistic, 3d render, doodle, childish drawing, flat vector`,
    lighting: "even, clear, illustrative — no dramatic photographic lighting",
    palette: "soft muted technical-illustration colors, clean fills",
    framing: "a single component as the clear hero, partial cutaway / exploded view to show internals, generous space",
    aspect: "16:9",
    kenBurnsZoom: 0,
    targetBeatSeconds: 3.5,
    musicMood: "driving, focused, understated electronic bed",
    model: "nano_banana_2",
    imageParams: { resolution: "2k" },
    referenceDriven: true,
  },
};

export function getStylePreset(id: PresetId): StyleBible {
  const preset = STYLE_PRESETS[id];
  if (!preset) throw new Error(`unknown style preset: ${id}`);
  return preset;
}
