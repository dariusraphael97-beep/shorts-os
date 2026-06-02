import { describe, it, expect } from "vitest";
import { LongformPlanSchema, WriterOutputSchema, StylePickerOutputSchema } from "@/lib/agents/longform/types";
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
});
