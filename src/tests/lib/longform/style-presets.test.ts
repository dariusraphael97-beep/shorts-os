import { describe, it, expect } from "vitest";
import { STYLE_PRESETS, getStylePreset, PRESET_IDS } from "@/lib/longform/style-presets";

describe("longform/style-presets", () => {
  it("exposes the cinematic, editorial, stick-figure, naturalist, and technical-illustration presets", () => {
    expect(PRESET_IDS).toEqual(["cinematic-realistic", "editorial-graphic", "stick-figure-animated", "naturalist-illustration", "technical-illustration"]);
  });

  it("technical-illustration is a SIMPLE illustrated (not photoreal) reference-driven style, SFX off", () => {
    const p = getStylePreset("technical-illustration");
    const pre = p.positivePrefix.toLowerCase();
    expect(pre).toMatch(/illustration/);
    expect(pre).toMatch(/simple/); // simplified — one clear subject, not a busy diagram
    expect(pre).toMatch(/reference/); // draws from a real reference photo
    expect(p.negativePrompt.toLowerCase()).toMatch(/photograph|photorealistic/); // NOT photoreal
    expect(p.negativePrompt.toLowerCase()).toMatch(/busy|cluttered|text-heavy/); // suppress clutter
    expect(p.referenceDriven).toBe(true);
    expect(p.soundEffectsEnabled).toBe(false); // engine SFX can't be authentic via text-to-SFX
    expect(p.model).toBe("nano_banana_2");
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

  it("stick-figure preset v3 = CRUDE felt-tip doodle (wobbly marker, MS-Paint fills, sparse captions, quiet audio)", () => {
    const p = getStylePreset("stick-figure-animated");
    const pre = p.positivePrefix.toLowerCase();
    expect(pre).toMatch(/stick ?figure|stickman/);
    expect(pre).toMatch(/doodle|hand-drawn/);
    // v3: the reference (yt st_Ah6Ykbh4, dense re-watch 2026-06-12) is CRUDE felt-tip, not clean vector
    expect(pre).toMatch(/crude/);
    expect(pre).toMatch(/wobbly/);
    expect(pre).toMatch(/ms ?paint/);
    expect(pre).toMatch(/eyebrow/);            // eyebrows do the emotional acting
    expect(pre).toMatch(/no shading|no gradient/);
    expect(pre).toMatch(/crisp|legible/);      // crude drawing, crisp file
    // gpt_image_2 has no negative-prompt param, so style suppressors live in the POSITIVE prompt.
    expect(pre).toMatch(/no 3d|no realistic|no anime|no photoreal/);
    expect(pre).toMatch(/do not beautify|do not polish/); // stop the model up-rendering the doodle
    expect(pre).not.toMatch(/do not make it look good/);  // v1's over-cooked suppressor stays gone
    // scenes get a simple colored setting/background keyed per beat (not forced white).
    expect(`${p.framing} ${p.palette}`.toLowerCase()).toMatch(/background|environment|setting|scene/);
    expect(p.framing.toLowerCase()).toContain("collage"); // still forbid collages
    // subtle Ken-Burns push-in like the reference (reverted to 0 if zoompan jitters — Task 12)
    expect(p.kenBurnsZoom).toBeLessThanOrEqual(0.04);
    expect(p.targetBeatSeconds).toBeGreaterThanOrEqual(2);
    expect(p.targetBeatSeconds).toBeLessThanOrEqual(3);
    // doodle-essay text + audio behavior
    expect(p.onScreenTextMode).toBe("sparse");
    expect(p.soundEffectsEnabled).toBe(true);
    expect(p.musicMood.toLowerCase()).toMatch(/no music|ambient/);
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
