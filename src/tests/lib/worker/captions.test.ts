import { describe, it, expect } from "vitest";
import { wordsToSrt } from "../../../../scripts/render-worker/lib/captions.ts";

describe("wordsToSrt", () => {
  it("returns empty string for empty input", () => {
    expect(wordsToSrt([])).toBe("");
  });

  it("groups up to 3 words per cue, uppercases, formats timestamps", () => {
    const out = wordsToSrt([
      { word: "the", start: 0.0, end: 0.2 },
      { word: "fastest", start: 0.2, end: 0.7 },
      { word: "car", start: 0.7, end: 1.0 },
      { word: "ever", start: 1.1, end: 1.4 },
    ]);
    expect(out).toContain("00:00:00,000 --> 00:00:01,000");
    expect(out).toContain("THE FASTEST CAR");
    expect(out).toContain("00:00:01,100 --> 00:00:01,400");
    expect(out).toContain("EVER");
  });

  it("breaks a cue when duration exceeds 2.0s even if word count fits", () => {
    const out = wordsToSrt([
      { word: "a", start: 0.0, end: 0.1 },
      { word: "b", start: 2.5, end: 2.6 },  // 2.6 - 0.0 = 2.6 > 2.0 → break
    ]);
    expect(out.split(/\n\n/).filter(Boolean).length).toBe(2);
  });
});
