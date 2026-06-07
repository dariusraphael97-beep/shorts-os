import { describe, it, expect } from "vitest";
import { STYLE_PRESETS, getStylePreset, PRESET_IDS } from "@/lib/longform/style-presets";

describe("longform/style-presets", () => {
  it("exposes the cinematic, editorial, stick-figure, and naturalist presets", () => {
    expect(PRESET_IDS).toEqual(["cinematic-realistic", "editorial-graphic", "stick-figure-animated", "naturalist-illustration"]);
  });

  it("each preset has a non-empty positive prefix, a rich negative list, 16:9 aspect, a beat target, and an image model", () => {
    for (const id of PRESET_IDS) {
      const p = getStylePreset(id);
      expect(p.presetId).toBe(id);
      expect(p.positivePrefix.length).toBeGreaterThan(20);
      expect(p.negativePrompt.split(",").length).toBeGreaterThanOrEqual(6);
      expect(p.aspect).toBe("16:9");
      expect(p.targetBeatSeconds).toBeGreaterThan(0);
      expect(p.musicMood.length).toBeGreaterThan(0);
      // every style now carries its own render model + params (dynamic styles).
      expect(p.model.length).toBeGreaterThan(0);
      expect(typeof p.imageParams).toBe("object");
    }
  });

  it("cinematic preset encodes the teal/amber photoreal documentary look", () => {
    const p = getStylePreset("cinematic-realistic");
    expect(p.positivePrefix.toLowerCase()).toMatch(/cinematic|photoreal/);
    expect(p.palette.toLowerCase()).toMatch(/teal|amber/);
  });

  it("stick-figure preset encodes a CLEAN simple hand-drawn doodle (smooth lines, expressive faces, colored scenes)", () => {
    const p = getStylePreset("stick-figure-animated");
    const pre = p.positivePrefix.toLowerCase();
    expect(pre).toMatch(/stick ?figure|stickman/);
    expect(pre).toMatch(/doodle|hand-drawn/);
    expect(pre).toMatch(/clean|smooth/); // Zenn is simple but CLEAN — corrected from the over-crude v1
    expect(pre).not.toMatch(/ms ?paint/);
    expect(pre).not.toMatch(/do not make it look good|wobbly|uneven/);
    // gpt_image_2 has no negative-prompt param, so style suppressors live in the POSITIVE prompt.
    expect(pre).toMatch(/no 3d|no realistic|no anime|no photoreal/);
    // scenes get a simple colored setting/background when the moment calls for one (not forced white).
    expect(`${p.framing} ${p.palette}`.toLowerCase()).toMatch(/background|environment|setting|scene/);
    expect(p.framing.toLowerCase()).toContain("collage"); // still forbid collages
    // static hold (no jittery Ken-Burns) for this preset; fast Zenn cadence: a new image every 2-3s.
    expect(p.kenBurnsZoom).toBeLessThanOrEqual(0.04);
    expect(p.targetBeatSeconds).toBeGreaterThanOrEqual(2);
    expect(p.targetBeatSeconds).toBeLessThanOrEqual(3);
  });

  it("naturalist preset = detailed illustration on a high-quality model (for animal/nature niches)", () => {
    const p = getStylePreset("naturalist-illustration");
    const pre = p.positivePrefix.toLowerCase();
    expect(pre).toMatch(/naturalist|illustration|watercolor|field guide/);
    expect(pre).not.toMatch(/stick figure|doodle/);
    expect(p.negativePrompt.toLowerCase()).toMatch(/doodle|stick figure/); // explicitly NOT the doodle look
    expect(p.model).toBe("nano_banana_2"); // high-quality model, not gpt_image_2 low
    expect(p.imageParams.resolution).toBe("2k");
  });

  it("getStylePreset throws on an unknown id", () => {
    // @ts-expect-error invalid id
    expect(() => getStylePreset("painterly")).toThrow();
  });
});
