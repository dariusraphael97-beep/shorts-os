// Cold-start sealed-prediction band. No historical outcomes yet, so this is a transparent
// heuristic: lower = 0.4× avg_views; upper = (3.0 + velocityBoost)× avg_views, where a higher
// 24h velocity widens the optimistic bound. Recorded k-factors make the band auditable later.
export const PREDICTION_K = { lower: 0.4, upperBase: 3.0, velocityWeight: 0.25 } as const;

export function predictionInterval(
  avgViews: number | null,
  avgVelocity24h: number | null,
): { lower: number; upper: number } {
  if (!avgViews || avgViews <= 0) return { lower: 0, upper: 0 };
  const velocityBoost = Math.max(0, avgVelocity24h ?? 0) * PREDICTION_K.velocityWeight;
  return {
    lower: Math.round(avgViews * PREDICTION_K.lower),
    upper: Math.round(avgViews * (PREDICTION_K.upperBase + velocityBoost)),
  };
}
