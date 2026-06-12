import { describe, it, expect } from "vitest";
import { splitIntoSentences, splitNarrationIntoBeats } from "@/lib/longform/beats";

const wc = (s: string) => s.split(/\s+/).filter(Boolean).length;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

describe("longform/beats", () => {
  it("splits prose into sentences keeping terminal punctuation", () => {
    expect(splitIntoSentences("A man walks in. The lights dim! Why?")).toEqual([
      "A man walks in.",
      "The lights dim!",
      "Why?",
    ]);
  });

  it("packs short sentences into beats near the target size", () => {
    const narration =
      "It is the fourth of March. A marble hall in downtown Dubai. " +
      "A man walks onto the stage. He clicks a remote and the lights dim.";
    const beats = splitNarrationIntoBeats(narration, { targetBeatSeconds: 4, wordsPerSecond: 2.4 });
    expect(beats.length).toBeGreaterThanOrEqual(2);
    for (const b of beats) {
      expect(b.text.length).toBeGreaterThan(0);
      expect(b.estDurationSeconds).toBeGreaterThan(0);
    }
    // contiguous partition: concatenated beat text == the narration (no words lost/added)
    expect(norm(beats.map((b) => b.text).join(" "))).toBe(norm(narration));
  });

  it("splits a long sentence at its clause boundaries instead of one lingering beat", () => {
    const long =
      "The mornings stretched like open highways, the afternoons unfolded slowly, deliberately, almost endlessly, and the evenings seemed to last forever.";
    const beats = splitNarrationIntoBeats(long, { targetBeatSeconds: 2.5, wordsPerSecond: 3 });
    expect(beats.length).toBeGreaterThanOrEqual(2); // not a single 5s image
    expect(norm(beats.map((b) => b.text).join(" "))).toBe(norm(long)); // contiguity preserved
  });

  it("hard-splits an over-long clause with no internal punctuation (no 5s lingering image)", () => {
    const long =
      "This single very long uninterrupted sentence keeps going well past the beat budget without any terminal punctuation until here.";
    const beats = splitNarrationIntoBeats(long, { targetBeatSeconds: 2.5, wordsPerSecond: 3 });
    expect(beats.length).toBeGreaterThanOrEqual(2);
    const maxBeat = Math.max(...beats.map((b) => b.estDurationSeconds));
    expect(maxBeat).toBeLessThanOrEqual(2.5 * 1.6); // capped — no long lingering beat
  });

  it("merges a tiny fragment so no image flashes too briefly", () => {
    const narration =
      "Go. A single Tuesday could contain three completely different adventures, a whole world of " +
      "possibility, and what felt like endless hours to explore every corner of it before dinner.";
    const beats = splitNarrationIntoBeats(narration, { targetBeatSeconds: 2.5, wordsPerSecond: 3 });
    expect(beats.length).toBeGreaterThan(1);
    expect(beats.every((b) => wc(b.text) >= 2)).toBe(true); // no 1-word "Go." flash
    expect(norm(beats.map((b) => b.text).join(" "))).toBe(norm(narration));
  });

  it("keeps an even cadence: no beat is far longer than the target", () => {
    const narration =
      "Think back. A single summer when you were eight years old. The mornings stretched like open highways. " +
      "Afternoons unfolded slowly, deliberately, almost endlessly. A single Tuesday could contain three different adventures.";
    const beats = splitNarrationIntoBeats(narration, { targetBeatSeconds: 2.5, wordsPerSecond: 3 });
    const maxBeat = Math.max(...beats.map((b) => b.estDurationSeconds));
    expect(maxBeat).toBeLessThanOrEqual(2.5 * 1.6); // no long lingering image
    // and no flash: every beat except possibly one unmergeable tail has a sensible minimum
    const tooShort = beats.filter((b) => wc(b.text) < 3);
    expect(tooShort.length).toBeLessThanOrEqual(1);
    expect(norm(beats.map((b) => b.text).join(" "))).toBe(norm(narration));
  });
});
