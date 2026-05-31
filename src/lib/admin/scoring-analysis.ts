export type ScoreComponents = { first_mover_score: number; proven_score: number; niche_score: number };

export function averageSignalContributions(
  clusters: Array<{ explainability_top_signals: Record<string, number> }>,
): Record<string, number> {
  const sums: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const c of clusters) {
    for (const [k, v] of Object.entries(c.explainability_top_signals ?? {})) {
      if (typeof v !== "number" || Number.isNaN(v)) continue;
      sums[k] = (sums[k] ?? 0) + v;
      counts[k] = (counts[k] ?? 0) + 1;
    }
  }
  const out: Record<string, number> = {};
  for (const k of Object.keys(sums)) out[k] = sums[k] / counts[k];
  return out;
}

export interface ActionCounts { viewed: number; investigated: number; generated_from: number; dismissed: number; hidden: number; }

export interface ActionCorrelationResult {
  actedCount: number;
  negativeCount: number;
  actedAvg: ScoreComponents;
  negativeAvg: ScoreComponents;
}

function avgComponents(rows: Array<{ first_mover_score: number; proven_score: number; niche_score: number }>): ScoreComponents {
  if (rows.length === 0) return { first_mover_score: 0, proven_score: 0, niche_score: 0 };
  const acc = rows.reduce(
    (a, r) => ({
      first_mover_score: a.first_mover_score + (r.first_mover_score ?? 0),
      proven_score: a.proven_score + (r.proven_score ?? 0),
      niche_score: a.niche_score + (r.niche_score ?? 0),
    }),
    { first_mover_score: 0, proven_score: 0, niche_score: 0 },
  );
  return {
    first_mover_score: acc.first_mover_score / rows.length,
    proven_score: acc.proven_score / rows.length,
    niche_score: acc.niche_score / rows.length,
  };
}

export function actionCorrelation(
  clusters: Array<{ id: string; first_mover_score: number; proven_score: number; niche_score: number }>,
  actionsByCluster: Record<string, ActionCounts>,
): ActionCorrelationResult {
  const acted: typeof clusters = [];
  const negative: typeof clusters = [];
  for (const c of clusters) {
    const a = actionsByCluster[c.id];
    if (!a) continue;
    const isActed = a.investigated > 0 || a.generated_from > 0;
    const isNegative = a.dismissed > 0 || a.hidden > 0;
    if (isActed) acted.push(c);
    else if (isNegative) negative.push(c);
  }
  return {
    actedCount: acted.length,
    negativeCount: negative.length,
    actedAvg: avgComponents(acted),
    negativeAvg: avgComponents(negative),
  };
}

export interface PredictionAccuracyResult {
  total: number; within: number; above: number; below: number;
  withinPct: number; abovePct: number; belowPct: number;
}

export function predictionAccuracy(
  closed: Array<{ accuracy_verdict: "within" | "above" | "below" | null }>,
): PredictionAccuracyResult | null {
  const rows = closed.filter((r) => r.accuracy_verdict !== null);
  if (rows.length === 0) return null;
  const within = rows.filter((r) => r.accuracy_verdict === "within").length;
  const above = rows.filter((r) => r.accuracy_verdict === "above").length;
  const below = rows.filter((r) => r.accuracy_verdict === "below").length;
  const total = rows.length;
  const pct = (n: number) => Math.round((n / total) * 100);
  return { total, within, above, below, withinPct: pct(within), abovePct: pct(above), belowPct: pct(below) };
}
