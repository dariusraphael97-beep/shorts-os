import { describe, it, expect } from "vitest";
import { STYLE_PRESETS, getStylePreset, PRESET_IDS } from "@/lib/longform/style-presets";

describe("longform/style-presets", () => {
  it("exposes exactly the two L1 presets", () => {
    expect(PRESET_IDS).toEqual(["cinematic-realistic", "editorial-graphic"]);
  });

  it("each preset has a non-empty positive prefix, a rich negative list, 16:9 aspect, and a beat target", () => {
    for (const id of PRESET_IDS) {
      const p = getStylePreset(id);
      expect(p.presetId).toBe(id);
      expect(p.positivePrefix.length).toBeGreaterThan(20);
      expect(p.negativePrompt.split(",").length).toBeGreaterThanOrEqual(6);
      expect(p.aspect).toBe("16:9");
      expect(p.targetBeatSeconds).toBeGreaterThan(0);
      expect(p.musicMood.length).toBeGreaterThan(0);
    }
  });

  it("cinematic preset encodes the teal/amber photoreal documentary look", () => {
    const p = getStylePreset("cinematic-realistic");
    expect(p.positivePrefix.toLowerCase()).toMatch(/cinematic|photoreal/);
    expect(p.palette.toLowerCase()).toMatch(/teal|amber/);
  });

  it("getStylePreset throws on an unknown id", () => {
    // @ts-expect-error invalid id
    expect(() => getStylePreset("painterly")).toThrow();
  });
});
