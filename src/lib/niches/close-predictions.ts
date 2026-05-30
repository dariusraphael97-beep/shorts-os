import "server-only";

export interface CloseablePrediction { predictionId: string; actualViews7d: number }
export interface PredictionCloseDeps {
  fetchCloseable: () => Promise<CloseablePrediction[]>;
  attachOutcome: (predictionId: string, actualViews7d: number) => Promise<void>;
}
export interface PredictionCloseResult { closed: number }

export async function runPredictionClose(deps: PredictionCloseDeps): Promise<PredictionCloseResult> {
  const closeable = await deps.fetchCloseable();
  for (const c of closeable) await deps.attachOutcome(c.predictionId, c.actualViews7d);
  return { closed: closeable.length };
}
