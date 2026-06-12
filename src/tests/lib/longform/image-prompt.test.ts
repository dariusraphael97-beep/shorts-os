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

  // sparse mode: build the bible by overriding, so this test is independent of preset defaults
  const sparseBible = { ...getStylePreset("stick-figure-animated"), onScreenTextMode: "sparse" as const };

  it("sparse mode: caption renders as hand-lettered ALL-CAPS marker text (upper-cased)", () => {
    const out = assembleImagePrompt({ sceneDescription: "a stick figure at a kitchen table", styleBible: sparseBible, onScreenText: "every single meal" });
    expect(out.prompt).toContain('reading exactly "EVERY SINGLE MEAL"');
    expect(out.prompt.toLowerCase()).toContain("marker");
    expect(out.prompt.toLowerCase()).toContain("hand-lettered");
  });

  it("sparse mode: objectLabel renders as a small lowercase hand-written label", () => {
    const out = assembleImagePrompt({ sceneDescription: "an old leather diary on a wooden table", styleBible: sparseBible, objectLabel: "diary, 1400s." });
    expect(out.prompt).toContain('label reading exactly "diary, 1400s."');
    expect(out.prompt.toLowerCase()).toContain("lowercase");
    expect(out.prompt).not.toContain("no on-screen text"); // label IS the text — don't suppress it
  });

  it("sparse mode with neither caption nor label suppresses all text", () => {
    const out = assembleImagePrompt({ sceneDescription: "a campfire under a starfield", styleBible: sparseBible });
    expect(out.prompt).toContain("no on-screen text");
  });

  it("backgroundMood is baked into the prompt as a flat solid background", () => {
    const out = assembleImagePrompt({ sceneDescription: "a stick figure lying awake", styleBible: sparseBible, backgroundMood: "deep navy" });
    expect(out.prompt).toContain("flat solid deep navy background");
  });

  it("no backgroundMood → no background clause (other presets unaffected)", () => {
    const out = assembleImagePrompt({ sceneDescription: "a misty forest", styleBible: bible });
    // cinematic-realistic framing contains "flat solid" in its own text; assert the specific
    // per-beat background clause (which includes "filling the frame") is absent
    expect(out.prompt).not.toContain("flat solid deep navy background");
    expect(out.prompt).not.toContain("background filling the frame");
  });
});
