import { describe, it, expect } from "vitest";
import { countWords, beatDurationsFromWordStarts, wordsFromCharAlignment } from "@/lib/longform/beat-timing";

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
