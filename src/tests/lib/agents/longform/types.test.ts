import { describe, it, expect } from "vitest";
import { LongformPlanSchema, WriterOutputSchema, StylePickerOutputSchema, BeatSchema, SceneItemsSchema, StyleBibleSchema } from "@/lib/agents/longform/types";
import { EMPTY_LONGFORM_PLAYBOOK } from "@/lib/agents/longform/playbook";

describe("longform/types", () => {
  it("validates a well-formed plan and round-trips through JSON", () => {
    const plan = {
      topic: "Why Dubai is building an underwater city",
      targetDurationSeconds: 540,
      presetId: "cinematic-realistic" as const,
      musicMood: "cinematic, suspenseful",
      angle: "A city that ran out of room builds down instead of up.",
      hook: "It's the 4th of March, 2023. A marble hall in downtown Dubai.",
      estimatedWords: 1296,
      captionsEnabled: false,
      voice: { provider: "cartesia", voiceId: "5ee9feff-1265-424a-9d7f-8e4d431a12c7", speed: 0.95, stability: 0.6 },
      styleBible: {
        presetId: "cinematic-realistic", positivePrefix: "x", negativePrompt: "no text",
        lighting: "x", palette: "teal", framing: "x", aspect: "16:9", kenBurnsZoom: 0.06,
        targetBeatSeconds: 4.5, musicMood: "cinematic",
        model: "text2image_soul_v2", imageParams: { quality: "2k" },
      },
      chapters: [
        { index: 0, title: "The Reveal", purpose: "open on the stage", narration: "A man walks on. The lights dim.",
          beats: [{ index: 0, narrationSlice: "A man walks on.", estDurationSeconds: 4, sceneDescription: "a man on a dark stage", imagePrompt: "p", negativePrompt: "no text" }] },
      ],
    };
    const parsed = LongformPlanSchema.parse(plan);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed);
  });

  it("rejects a target duration outside 180-1200", () => {
    expect(() => LongformPlanSchema.parse({ targetDurationSeconds: 10 } as never)).toThrow();
  });

  it("writer output requires at least one chapter with narration", () => {
    expect(() => WriterOutputSchema.parse({ angle: "a", hook: "h", estimatedWords: 10, chapters: [] })).toThrow();
  });

  it("style picker output is one of the two presets", () => {
    const ok = StylePickerOutputSchema.parse({ presetId: "editorial-graphic", musicMood: "clean", rationale: "finance explainer reads better as bold graphics than photoreal footage." });
    expect(ok.presetId).toBe("editorial-graphic");
  });

  it("exposes an empty (stub) playbook for every agent", () => {
    expect(EMPTY_LONGFORM_PLAYBOOK.writer.exemplarHooks).toEqual([]);
    expect(EMPTY_LONGFORM_PLAYBOOK.stylePicker.presetWinsByGenre).toEqual({});
    expect(EMPTY_LONGFORM_PLAYBOOK.beatPlanner.promptPatternTags).toEqual([]);
  });

  it("EMPTY playbook carries the new retention-first L2 fields, all empty (back-compat)", () => {
    expect(EMPTY_LONGFORM_PLAYBOOK.writer.winningTitleFormulas).toEqual([]);
    expect(EMPTY_LONGFORM_PLAYBOOK.writer.rankedExemplars).toEqual([]);
    expect(EMPTY_LONGFORM_PLAYBOOK.thumbnail).toEqual({ winningWordCombos: [], winningNumberPatterns: [] });
    // sampleSize 0 is the cold-start sentinel: agents treat this playbook as "no learning yet".
    expect(EMPTY_LONGFORM_PLAYBOOK.retention.sampleSize).toBe(0);
    expect(EMPTY_LONGFORM_PLAYBOOK.retention.medianFirst30sRetention).toBeNull();
    expect(EMPTY_LONGFORM_PLAYBOOK.retention.bestFirst30sRetention).toBeNull();
  });
});

describe("doodle-essay schema additions", () => {
  it("BeatSchema accepts optional objectLabel and backgroundMood", () => {
    const beat = {
      index: 0, narrationSlice: "n", estDurationSeconds: 2.5, sceneDescription: "s",
      imagePrompt: "ip", negativePrompt: "np",
      objectLabel: "diary, 1400s.", backgroundMood: "deep navy",
    };
    const parsed = BeatSchema.parse(beat);
    expect(parsed.objectLabel).toBe("diary, 1400s.");
    expect(parsed.backgroundMood).toBe("deep navy");
    // and both stay optional
    expect(() => BeatSchema.parse({ ...beat, objectLabel: undefined, backgroundMood: undefined })).not.toThrow();
  });

  it("SceneItemsSchema accepts label + background per item, defaulting to empty strings", () => {
    const parsed = SceneItemsSchema.parse({ items: [{ scene: "s", onScreenText: "", sound: "" }] });
    expect(parsed.items[0].label).toBe("");
    expect(parsed.items[0].background).toBe("");
    const full = SceneItemsSchema.parse({ items: [{ scene: "s", onScreenText: "HOOK", sound: "", label: "cookbook, 1500s.", background: "white" }] });
    expect(full.items[0].label).toBe("cookbook, 1500s.");
    expect(full.items[0].background).toBe("white");
  });

  it("StyleBibleSchema accepts onScreenTextMode including the new 'sparse' value", () => {
    const base = {
      presetId: "stick-figure-animated", positivePrefix: "p", negativePrompt: "n",
      lighting: "l", palette: "p", framing: "f", aspect: "16:9" as const,
      kenBurnsZoom: 0.04, targetBeatSeconds: 2.5, musicMood: "m", model: "gpt_image_2", imageParams: {},
    };
    expect(() => StyleBibleSchema.parse({ ...base, onScreenTextMode: "sparse" })).not.toThrow();
    expect(() => StyleBibleSchema.parse({ ...base, onScreenTextMode: "exclusive" })).not.toThrow();
    expect(() => StyleBibleSchema.parse(base)).not.toThrow(); // still optional
    // round-trip: "sparse" must not be stripped
    expect(StyleBibleSchema.parse({ ...base, onScreenTextMode: "sparse" }).onScreenTextMode).toBe("sparse");
  });
});
