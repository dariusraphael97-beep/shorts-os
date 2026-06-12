// src/lib/longform/retention.ts
// Pure (no server-only) helpers that reduce a YouTube audience-retention curve into the opening-hold
// numbers the L2 playbook ranks on. Kept framework-free so it is unit-testable and reusable by both
// the analytics cron (to store derived columns) and the distiller.

export interface RetentionCurvePoint {
  /** 0–1 position through the video (YouTube buckets at ~1% granularity). */
  elapsedVideoTimeRatio: number;
  /** Fraction of the original audience still watching at this point (can be >1 from rewatches). */
  audienceWatchRatio: number;
  /** YouTube relativeRetentionPerformance at this point: 0–1, 0.5 = median peer of similar length. */
  relativeRetentionPerformance?: number | null;
}

export interface OpeningRetention {
  /** audienceWatchRatio at the 30s mark — the PRIMARY "did the hook hold?" signal. null when unknowable. */
  first30sRetention: number | null;
  /** audienceWatchRatio at the 60s mark. */
  first60sRetention: number | null;
  /** Mean relativeRetentionPerformance across the opening (≤30s) segment. null when no peer data. */
  relativeRetentionOpening: number | null;
}

const EMPTY: OpeningRetention = {
  first30sRetention: null,
  first60sRetention: null,
  relativeRetentionOpening: null,
};

/** audienceWatchRatio of the bucket whose elapsedVideoTimeRatio is nearest the target. */
function watchRatioNearest(curve: RetentionCurvePoint[], targetRatio: number): number | null {
  if (curve.length === 0) return null;
  let best = curve[0];
  let bestDiff = Math.abs(curve[0].elapsedVideoTimeRatio - targetRatio);
  for (const p of curve) {
    const diff = Math.abs(p.elapsedVideoTimeRatio - targetRatio);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = p;
    }
  }
  return best.audienceWatchRatio;
}

/**
 * Reduce a retention curve + video length into opening-hold numbers. Returns all-null when the curve is
 * empty or the duration is unusable (the caller then treats this video as "not measured").
 */
export function summarizeOpeningRetention(
  curve: RetentionCurvePoint[],
  durationSeconds: number | null | undefined,
): OpeningRetention {
  if (curve.length === 0 || !durationSeconds || durationSeconds <= 0) return { ...EMPTY };

  const ratio30 = Math.min(1, Math.max(0, 30 / durationSeconds));
  const ratio60 = Math.min(1, Math.max(0, 60 / durationSeconds));

  const opening = curve.filter(
    (p) => p.elapsedVideoTimeRatio <= ratio30 && p.relativeRetentionPerformance != null,
  );
  const relativeRetentionOpening =
    opening.length === 0
      ? null
      : opening.reduce((sum, p) => sum + (p.relativeRetentionPerformance as number), 0) / opening.length;

  return {
    first30sRetention: watchRatioNearest(curve, ratio30),
    first60sRetention: watchRatioNearest(curve, ratio60),
    relativeRetentionOpening,
  };
}
