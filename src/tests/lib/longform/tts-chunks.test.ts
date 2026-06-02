import { describe, it, expect } from "vitest";
import { planTtsChunks, cumulativeOffsets } from "@/lib/longform/tts-chunks";

describe("longform/tts-chunks", () => {
  it("packs sentences into chunks under maxChars without splitting a sentence", () => {
    const text = "One sentence here. Two sentence here. Three sentence here.";
    const chunks = planTtsChunks(text, 25);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(25 + 1);
    expect(chunks.join(" ")).toBe(text);
  });

  it("emits a single chunk when text fits", () => {
    expect(planTtsChunks("Short.", 100)).toEqual(["Short."]);
  });

  it("computes cumulative start offsets from per-chunk durations", () => {
    expect(cumulativeOffsets([2, 3, 1.5])).toEqual([0, 2, 5]);
  });

  it("an over-long single sentence still becomes its own chunk", () => {
    const long = "a".repeat(50) + ".";
    expect(planTtsChunks(long, 10)).toEqual([long]);
  });
});
