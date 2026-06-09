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

  it("includes a faithfulness clause (one subject, no merging/inventing, reproduce reference)", () => {
    const out = assembleImagePrompt({ sceneDescription: "a BMW B58 engine on a stand", styleBible: bible });
    expect(out.prompt).toContain("EXACTLY ONE");
    expect(out.prompt).toContain("faithfully");
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

  it("additive mode: the caption coexists with the scene's own labels (not 'only text')", () => {
    const tech = getStylePreset("technical-illustration");
    const out = assembleImagePrompt({ sceneDescription: "a labeled dyno chart", styleBible: tech, onScreenText: "550 hp wall" });
    expect(out.prompt).toContain('reading exactly "550 hp wall"');
    expect(out.prompt).toContain("alongside any labels");
    expect(out.prompt).not.toContain("the only text in the image");
  });

  it("additive mode with no caption adds no text instruction (diagram text stands)", () => {
    const tech = getStylePreset("technical-illustration");
    const out = assembleImagePrompt({ sceneDescription: "an invoice with line items", styleBible: tech });
    expect(out.prompt).not.toContain("no on-screen text");
    expect(out.prompt).not.toContain("reading exactly");
  });

  it("technical-illustration is additive; naturalist defaults to exclusive", () => {
    expect(getStylePreset("technical-illustration").onScreenTextMode).toBe("additive");
    expect(getStylePreset("naturalist-illustration").onScreenTextMode).toBeUndefined();
  });
});
