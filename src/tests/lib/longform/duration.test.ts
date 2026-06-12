import { describe, it, expect } from "vitest";
import {
  WORDS_PER_SECOND,
  clampTargetDuration,
  deriveChapterCount,
  estimateWordBudget,
  estimateNarrationSeconds,
} from "@/lib/longform/duration";

describe("longform/duration", () => {
  it("clamps target duration to the valid 180-1200s window", () => {
    expect(clampTargetDuration(60)).toBe(180);
    expect(clampTargetDuration(600)).toBe(600);
    expect(clampTargetDuration(9999)).toBe(1200);
  });

  it("derives ~1 chapter per 100s, clamped to 3..12", () => {
    expect(deriveChapterCount(180)).toBe(3); // floor is 3
    expect(deriveChapterCount(540)).toBe(5);
    expect(deriveChapterCount(600)).toBe(6);
    expect(deriveChapterCount(1200)).toBe(12);
  });

  it("estimates a word budget from the narration rate", () => {
    // 600s * 2.4 wps = 1440 words
    expect(estimateWordBudget(600)).toBe(Math.round(600 * WORDS_PER_SECOND));
  });

  it("estimates narration seconds from a word count (inverse of the budget)", () => {
    expect(estimateNarrationSeconds(240)).toBeCloseTo(240 / WORDS_PER_SECOND, 5);
  });
});
