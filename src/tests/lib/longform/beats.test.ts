import { describe, it, expect } from "vitest";
import { splitIntoSentences, splitNarrationIntoBeats } from "@/lib/longform/beats";

describe("longform/beats", () => {
  it("splits prose into sentences keeping terminal punctuation", () => {
    expect(splitIntoSentences("A man walks in. The lights dim! Why?")).toEqual([
      "A man walks in.",
      "The lights dim!",
      "Why?",
    ]);
  });

  it("groups sentences into beats of ~targetBeatSeconds without splitting a sentence", () => {
    // wps=2.4, target=4s => ~9.6 words per beat.
    const narration =
      "It is the fourth of March. A marble hall in downtown Dubai. " +
      "A man walks onto the stage. He clicks a remote and the lights dim.";
    const beats = splitNarrationIntoBeats(narration, { targetBeatSeconds: 4, wordsPerSecond: 2.4 });
    expect(beats.length).toBeGreaterThanOrEqual(2);
    // every beat carries non-empty text and a positive duration estimate
    for (const b of beats) {
      expect(b.text.length).toBeGreaterThan(0);
      expect(b.estDurationSeconds).toBeGreaterThan(0);
    }
    // concatenated beat text equals the original sentence stream (no words lost)
    expect(beats.map((b) => b.text).join(" ")).toBe(narration.trim());
  });

  it("emits a long sentence as its own beat even if it exceeds the target", () => {
    const long = "This single very long uninterrupted sentence keeps going well past the four second beat budget without any terminal punctuation until here.";
    const beats = splitNarrationIntoBeats(long, { targetBeatSeconds: 4, wordsPerSecond: 2.4 });
    expect(beats).toHaveLength(1);
    expect(beats[0].estDurationSeconds).toBeGreaterThan(4);
  });
});
