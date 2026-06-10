import { describe, it, expect } from "vitest";
import { summarizeOpeningRetention, type RetentionCurvePoint } from "@/lib/longform/retention";

// A ~10-min video: 30s == elapsedVideoTimeRatio 0.05, 60s == 0.10.
const TEN_MIN: RetentionCurvePoint[] = [
  { elapsedVideoTimeRatio: 0, audienceWatchRatio: 1.0, relativeRetentionPerformance: 0.6 },
  { elapsedVideoTimeRatio: 0.05, audienceWatchRatio: 0.8, relativeRetentionPerformance: 0.55 },
  { elapsedVideoTimeRatio: 0.1, audienceWatchRatio: 0.7, relativeRetentionPerformance: 0.5 },
  { elapsedVideoTimeRatio: 0.5, audienceWatchRatio: 0.4, relativeRetentionPerformance: 0.45 },
  { elapsedVideoTimeRatio: 1, audienceWatchRatio: 0.2, relativeRetentionPerformance: 0.4 },
];

describe("summarizeOpeningRetention", () => {
  it("reads the audienceWatchRatio at the 30s and 60s marks via the nearest bucket", () => {
    const r = summarizeOpeningRetention(TEN_MIN, 600);
    expect(r.first30sRetention).toBe(0.8); // nearest bucket to ratio 0.05
    expect(r.first60sRetention).toBe(0.7); // nearest bucket to ratio 0.10
  });

  it("averages relativeRetentionPerformance only over the opening (≤30s) segment", () => {
    const r = summarizeOpeningRetention(TEN_MIN, 600);
    // buckets with ratio ≤ 0.05 → 0.6 and 0.55 → mean 0.575
    expect(r.relativeRetentionOpening).toBeCloseTo(0.575, 5);
  });

  it("returns all-null for an empty curve or a missing/invalid duration", () => {
    expect(summarizeOpeningRetention([], 600)).toEqual({
      first30sRetention: null,
      first60sRetention: null,
      relativeRetentionOpening: null,
    });
    expect(summarizeOpeningRetention(TEN_MIN, null)).toEqual({
      first30sRetention: null,
      first60sRetention: null,
      relativeRetentionOpening: null,
    });
    expect(summarizeOpeningRetention(TEN_MIN, 0)).toEqual({
      first30sRetention: null,
      first60sRetention: null,
      relativeRetentionOpening: null,
    });
  });

  it("clamps the target ratio for short videos (≤30s) to the whole curve", () => {
    const short: RetentionCurvePoint[] = [
      { elapsedVideoTimeRatio: 0, audienceWatchRatio: 1.0, relativeRetentionPerformance: 0.7 },
      { elapsedVideoTimeRatio: 0.5, audienceWatchRatio: 0.6, relativeRetentionPerformance: 0.6 },
      { elapsedVideoTimeRatio: 1, audienceWatchRatio: 0.3, relativeRetentionPerformance: 0.5 },
    ];
    const r = summarizeOpeningRetention(short, 20); // 30/20 → clamp to 1.0
    expect(r.first30sRetention).toBe(0.3); // nearest bucket to ratio 1
    expect(r.first60sRetention).toBe(0.3);
    expect(r.relativeRetentionOpening).toBeCloseTo((0.7 + 0.6 + 0.5) / 3, 5);
  });

  it("yields null relative-opening when no opening bucket carries a relative value", () => {
    const noRel: RetentionCurvePoint[] = [
      { elapsedVideoTimeRatio: 0, audienceWatchRatio: 1.0 },
      { elapsedVideoTimeRatio: 0.05, audienceWatchRatio: 0.9 },
    ];
    const r = summarizeOpeningRetention(noRel, 600);
    expect(r.first30sRetention).toBe(0.9);
    expect(r.relativeRetentionOpening).toBeNull();
  });
});
