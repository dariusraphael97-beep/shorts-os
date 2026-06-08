import { describe, it, expect } from "vitest";
import { assembleImagePrompt } from "@/lib/longform/image-prompt";
import { getStylePreset } from "@/lib/longform/style-presets";

describe("longform/image-prompt", () => {
  const bible = getStylePreset("cinematic-realistic");

  it("wraps the scene in the style prefix, framing, lighting, and 16:9 cue", () => {
    const out = assembleImagePrompt({ sceneDescription: "a marble auditorium with a single spotlit podium", styleBible: bible });
    expect(out.prompt.startsWith(bible.positivePrefix)).toBe(true);
    expect(out.prompt).toContain("a marble auditorium with a single spotlit podium");
    expect(out.prompt).toContain("16:9");
    expect(out.prompt).toContain(bible.lighting);
    expect(out.negativePrompt).toBe(bible.negativePrompt);
  });

  it("trims and collapses whitespace in the scene description", () => {
    const bible = getStylePreset("editorial-graphic");
    const out = assembleImagePrompt({ sceneDescription: "  an   opening   vault  ", styleBible: bible });
    expect(out.prompt).toContain("an opening vault");
    expect(out.prompt).not.toContain("  ");
  });

  it("bakes an exact on-screen caption when one is provided", () => {
    const out = assembleImagePrompt({ sceneDescription: "a tiny wren on a branch", styleBible: bible, onScreenText: "14 grams" });
    expect(out.prompt).toContain('reading exactly "14 grams"');
    expect(out.prompt).toContain("the only text in the image");
  });

  it("instructs no text when the caption is empty or absent", () => {
    const out = assembleImagePrompt({ sceneDescription: "a misty forest at dawn", styleBible: bible });
    expect(out.prompt).toContain("no on-screen text");
  });
});
