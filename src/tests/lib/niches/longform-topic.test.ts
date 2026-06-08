// src/tests/lib/niches/longform-topic.test.ts
import { describe, it, expect } from "vitest";
import { clusterToLongformInput, targetFromWinnerDuration } from "@/lib/niches/longform-topic";

describe("clusterToLongformInput", () => {
  it("maps a native niche cluster to a longform topic + target duration", () => {
    const input = clusterToLongformInput({
      canonical_topic: "backyard birds ranked",
      production_fit: "native",
    });
    expect(input.topic).toBe("backyard birds ranked");
    expect(input.targetDurationSeconds).toBe(480);
  });

  it("throws for non-native production fit (cannot auto-generate)", () => {
    expect(() =>
      clusterToLongformInput({ canonical_topic: "asmr carving", production_fit: "needs_manual_recording" }),
    ).toThrow(/native/);
  });
});

describe("targetFromWinnerDuration", () => {
  it("matches the winner length when it's already in the 7–15 min band", () => {
    expect(targetFromWinnerDuration(720)).toBe(720); // 12 min winner → 12 min
  });
  it("clamps a very long winner down to 15 min", () => {
    expect(targetFromWinnerDuration(1500)).toBe(900);
  });
  it("clamps a short-ish winner up to 7 min", () => {
    expect(targetFromWinnerDuration(300)).toBe(420);
  });
  it("falls back to the 8-min default when duration is missing", () => {
    expect(targetFromWinnerDuration(undefined)).toBe(480);
    expect(targetFromWinnerDuration(null)).toBe(480);
  });
});

describe("clusterToLongformInput with a winner duration", () => {
  it("uses the winner's length for the target", () => {
    const input = clusterToLongformInput({
      canonical_topic: "deep sea creatures",
      production_fit: "native",
      winnerDurationSeconds: 600,
    });
    expect(input.targetDurationSeconds).toBe(600);
  });
});
