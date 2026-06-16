import { describe, it, expect } from "vitest";
import { countWords, beatDurationsFromWordStarts, wordsFromCharAlignment, stitchChunkWordTimes } from "@/lib/longform/beat-timing";

describe("longform/beat-timing", () => {
  it("counts whitespace-delimited words", () => {
    expect(countWords("  a  b c ")).toBe(3);
    expect(countWords("")).toBe(0);
    expect(countWords("one")).toBe(1);
  });

  it("maps beats onto real word start times → exact per-beat durations", () => {
    // 5 words at 0,0.5,1.0,1.5,2.0; total 3.0; beats consume 2 then 3 words
    const durations = beatDurationsFromWordStarts([2, 3], [0, 0.5, 1.0, 1.5, 2.0], 3.0);
    // beat0 starts at word0 (0.0), beat1 starts at word2 (1.0)
    expect(durations[0]).toBeCloseTo(1.0); // 1.0 - 0.0
    expect(durations[1]).toBeCloseTo(2.0); // 3.0 (total) - 1.0
  });

  it("stitches multi-chunk word times using REAL chunk durations, not alignment end times", () => {
    // chunk0: 2 words ending at 1.9s, but the decoded WAV is 2.2s (0.3s trailing silence).
    // chunk1: 2 words at relative 0.0 and 0.5.
    const stitched = stitchChunkWordTimes([
      { words: [{ word: "a", start: 0, end: 0.9 }, { word: "b", start: 1.0, end: 1.9 }], realDurationSeconds: 2.2 },
      { words: [{ word: "c", start: 0.0, end: 0.4 }, { word: "d", start: 0.5, end: 0.9 }], realDurationSeconds: 2.0 },
    ]);
    // chunk1 words must be offset by the REAL 2.2s, not by the 1.9s alignment end.
    expect(stitched.map((w) => w.start)).toEqual([0, 1.0, 2.2, 2.7]);
    expect(stitched[2].end).toBeCloseTo(2.6); // 0.4 + 2.2
  });

  it("stitches a single chunk unchanged and an empty list to []", () => {
    expect(stitchChunkWordTimes([])).toEqual([]);
    const one = stitchChunkWordTimes([
      { words: [{ word: "a", start: 0, end: 0.5 }], realDurationSeconds: 10 },
    ]);
    expect(one).toEqual([{ word: "a", start: 0, end: 0.5 }]);
  });

  it("accumulates real durations across three chunks (drift would compound otherwise)", () => {
    const stitched = stitchChunkWordTimes([
      { words: [{ word: "a", start: 0.1, end: 0.2 }], realDurationSeconds: 80.25 },
      { words: [{ word: "b", start: 0.1, end: 0.2 }], realDurationSeconds: 71.66 },
      { words: [{ word: "c", start: 0.1, end: 0.2 }], realDurationSeconds: 56.70 },
    ]);
    expect(stitched[1].start).toBeCloseTo(80.35); // 0.1 + 80.25
    expect(stitched[2].start).toBeCloseTo(152.01); // 0.1 + 80.25 + 71.66
  });

  it("the last beat runs to the end of the audio", () => {
    const durations = beatDurationsFromWordStarts([1, 1], [0, 4], 10);
    expect(durations[1]).toBeCloseTo(6); // 10 - 4
  });

  it("clamps to a minimum so a zero-length beat never breaks ffmpeg", () => {
    const durations = beatDurationsFromWordStarts([1, 1], [2, 2], 5, 0.4);
    expect(durations[0]).toBe(0.4); // both words at t=2 → 0 → clamped
  });

  it("falls past the end gracefully when fewer word times than expected (capped beats)", () => {
    const durations = beatDurationsFromWordStarts([2, 2], [0, 0.5], 4);
    expect(durations).toHaveLength(2);
    expect(durations.every((d) => d >= 0.4)).toBe(true);
  });

  it("wordsFromCharAlignment turns ElevenLabs char timings into word timings", () => {
    // "Time speeds" → T,i,m,e,space,s,p,e,e,d,s
    const chars = ["T", "i", "m", "e", " ", "s", "p", "e", "e", "d", "s"];
    const starts = [0.0, 0.1, 0.2, 0.3, 0.37, 0.42, 0.5, 0.55, 0.6, 0.65, 0.7];
    const ends = [0.1, 0.2, 0.3, 0.37, 0.42, 0.5, 0.55, 0.6, 0.65, 0.7, 0.8];
    const words = wordsFromCharAlignment(chars, starts, ends);
    expect(words.map((w) => w.word)).toEqual(["Time", "speeds"]);
    expect(words[0].start).toBeCloseTo(0.0);
    expect(words[0].end).toBeCloseTo(0.37);
    expect(words[1].start).toBeCloseTo(0.42);
    expect(words[1].end).toBeCloseTo(0.8);
  });
});
