import { describe, it, expect } from "vitest";
import { STYLE_PRESETS, getStylePreset, PRESET_IDS } from "@/lib/longform/style-presets";

describe("longform/style-presets", () => {
  it("exposes the cinematic, editorial, and stick-figure presets", () => {
    expect(PRESET_IDS).toEqual(["cinematic-realistic", "editorial-graphic", "stick-figure-animated"]);
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

  it("stick-figure preset encodes the crude MS-Paint stickman doodle look", () => {
    const p = getStylePreset("stick-figure-animated");
    const pre = p.positivePrefix.toLowerCase();
    expect(pre).toMatch(/stick ?figure|stickman/);
    expect(pre).toMatch(/ms ?paint|doodle|hand-drawn/);
    expect(pre).toContain("white background");
    // gpt_image_2 has no negative-prompt param, so the "do not make it good" + "no 3d/anime"
    // suppressors must be baked into the POSITIVE prompt to take effect.
    expect(pre).toMatch(/do not make it look (good|polished|professional)/);
    expect(pre).toMatch(/no 3d|no realistic|no anime/);
    // crude doodles read wrong with a hard Ken-Burns push and play at a relaxed cadence.
    expect(p.kenBurnsZoom).toBeLessThanOrEqual(0.04);
    expect(p.targetBeatSeconds).toBeGreaterThanOrEqual(3);
  });

  it("getStylePreset throws on an unknown id", () => {
    // @ts-expect-error invalid id
    expect(() => getStylePreset("painterly")).toThrow();
  });
});
