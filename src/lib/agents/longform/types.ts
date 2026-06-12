// src/lib/agents/longform/types.ts
import { z } from "zod";
import { PRESET_IDS } from "@/lib/longform/style-presets";

export const PresetIdSchema = z.enum(PRESET_IDS);

export const StyleBibleSchema = z.object({
  presetId: PresetIdSchema,
  positivePrefix: z.string().min(1),
  negativePrompt: z.string().min(1),
  lighting: z.string(),
  palette: z.string(),
  framing: z.string(),
  aspect: z.literal("16:9"),
  kenBurnsZoom: z.number().min(0).max(0.5),
  targetBeatSeconds: z.number().positive(),
  musicMood: z.string(),
  model: z.string().min(1),
  imageParams: z.record(z.string(), z.string()),
  referenceDriven: z.boolean().optional(),
  soundEffectsEnabled: z.boolean().optional(),
  onScreenTextMode: z.enum(["exclusive", "additive", "sparse"]).optional(),
});

export const VoiceChoiceSchema = z.object({
  provider: z.string().min(1),
  voiceId: z.string().min(1),
  speed: z.number().min(0.5).max(1.5),
  stability: z.number().min(0).max(1),
});

// --- Researcher (fact-grounding) ---
export const FactSheetItemSchema = z.object({
  claim: z.string().min(1),
  detail: z.string().min(1),
  sourceUrl: z.string().url().optional(),
});
export type FactSheetItem = z.infer<typeof FactSheetItemSchema>;

export const FactSheetSchema = z.object({
  facts: z.array(FactSheetItemSchema).default([]),
  uncertain: z.array(z.string()).default([]),
});
export type FactSheet = z.infer<typeof FactSheetSchema>;

// --- Writer (multi-pass) ---
export const WriterHookSchema = z.object({
  angle: z.string().min(10).max(600),
  hook: z.string().min(20).max(900),
});
export const WriterOutlineSchema = z.object({
  chapters: z.array(z.object({ title: z.string().min(1).max(120), purpose: z.string().min(1).max(300) })).min(1).max(12),
});
export const WriterChapterNarrationSchema = z.object({
  narration: z.string().min(40),
});
export const WriterOutputSchema = z.object({
  angle: z.string().min(1),
  hook: z.string().min(1),
  estimatedWords: z.number().int().nonnegative(),
  chapters: z.array(z.object({
    title: z.string().min(1),
    purpose: z.string().min(1),
    narration: z.string().min(1),
  })).min(1),
  factSheet: FactSheetSchema.default({ facts: [], uncertain: [] }),
});
export type WriterOutput = z.infer<typeof WriterOutputSchema>;

// --- Operator-provided script (skips the Writer agent; doodle-essay etc.) ---
export const ScriptOverrideSchema = z.object({
  angle: z.string().min(1),
  hook: z.string().min(1),
  chapters: z.array(z.object({
    title: z.string().min(1).max(120),
    purpose: z.string().min(1).max(300),
    narration: z.string().min(40),
  })).min(1).max(12),
});
export type ScriptOverride = z.infer<typeof ScriptOverrideSchema>;

// --- Style picker ---
export const StylePickerOutputSchema = z.object({
  presetId: PresetIdSchema,
  musicMood: z.string().min(3).max(160),
  rationale: z.string().min(20).max(500),
});
export type StylePickerOutput = z.infer<typeof StylePickerOutputSchema>;

// --- Beat planner ---
export const BeatSchema = z.object({
  index: z.number().int().nonnegative(),
  narrationSlice: z.string().min(1),
  estDurationSeconds: z.number().positive(),
  sceneDescription: z.string().min(1),
  imagePrompt: z.string().min(1),
  negativePrompt: z.string().min(1),
  /** The single retention-hook caption rendered on-screen for this beat ("" = no text). */
  onScreenText: z.string().optional(),
  /** Whether this beat should use a real web photo or a generated illustration. */
  visualKind: z.enum(["photo", "illustration"]).default("illustration"),
  /** Search query for a real photo when visualKind === "photo" (else ""). */
  photoQuery: z.string().default(""),
  /** Optional short text-to-SFX prompt for this moment (e.g. "a hawk screech"); empty = no sound. */
  soundEffect: z.string().optional(),
  /** Small lowercase evidence label drawn next to the subject (e.g. "diary, 1400s."); absent = none. */
  objectLabel: z.string().optional(),
  /** Flat solid background color/mood for this beat (e.g. "deep navy"); absent = preset default. */
  backgroundMood: z.string().optional(),
});
export const ChapterBeatsSchema = z.object({
  chapterIndex: z.number().int().nonnegative(),
  beats: z.array(BeatSchema).min(1),
});
export const BeatPlannerOutputSchema = z.object({ chapters: z.array(ChapterBeatsSchema).min(1) });
export type BeatPlannerOutput = z.infer<typeof BeatPlannerOutputSchema>;
// The per-chapter LLM call returns, per beat, a visual scene + an optional short sound-effect cue
// ("" when no real-world sound fits). Pure code assembles the image prompt; the sound drives SFX.
export const SceneItemsSchema = z.object({
  items: z.array(z.object({
    scene: z.string().min(1),
    onScreenText: z.string(),
    sound: z.string(),
    visualKind: z.enum(["photo", "illustration"]).default("illustration"),
    photoQuery: z.string().default(""),
    label: z.string().default(""), // → Beat.objectLabel (small lowercase evidence label; sparse styles only)
    background: z.string().default(""), // → Beat.backgroundMood (flat solid per-beat background; sparse styles only)
  })).min(1),
});
// (legacy) scenes-only shape, kept for any callers that only need descriptions.
export const SceneDescriptionsSchema = z.object({ scenes: z.array(z.string().min(1)).min(1) });

// --- Persisted plan ---
export const PlanChapterSchema = z.object({
  index: z.number().int().nonnegative(),
  title: z.string().min(1),
  purpose: z.string().min(1),
  narration: z.string().min(1),
  beats: z.array(BeatSchema).min(1),
});
export const LongformPlanSchema = z.object({
  topic: z.string().min(1),
  targetDurationSeconds: z.number().int().min(180).max(1200),
  presetId: PresetIdSchema,
  styleBible: StyleBibleSchema,
  musicMood: z.string().min(1),
  angle: z.string().min(1),
  hook: z.string().min(1),
  voice: VoiceChoiceSchema,
  estimatedWords: z.number().int().nonnegative(),
  captionsEnabled: z.boolean(),
  chapters: z.array(PlanChapterSchema).min(1),
  // The sourced fact sheet that grounded this video's narration (audit trail). Optional for
  // back-compat with plans written before fact-grounding existed.
  factSheet: FactSheetSchema.optional(),
});
export type LongformPlan = z.infer<typeof LongformPlanSchema>;
