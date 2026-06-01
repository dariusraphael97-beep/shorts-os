// Pure rollup helpers for agent learning loops.
//
// NOTE: A rollupGeneratorEdits-style loop is intentionally deferred until an operator
// script-edit surface exists (Phase 3 editor co-pilot). The `your_videos.generator_edits`
// column (already migrated) is its future home. Do NOT fake a hook here.

export type AccuracyOutcome = 'within' | 'above' | 'below';

export interface PredictionAccuracy {
  within: number;
  above: number;
  below: number;
  n: number;
}

export interface ComponentFeedback {
  accepted: number;
  ignored: number;
  partial: number;
}

export type ReviewFeedbackWeights = Record<string, ComponentFeedback>;

/**
 * Pure, immutable rollup of a single prediction outcome into the running accuracy tally.
 * Returns a new object; never mutates `existing`.
 */
export function rollupPredictionAccuracy(
  existing: PredictionAccuracy | null,
  outcome: AccuracyOutcome,
): PredictionAccuracy {
  const base: PredictionAccuracy = existing
    ? { ...existing }
    : { within: 0, above: 0, below: 0, n: 0 };
  return { ...base, [outcome]: base[outcome] + 1, n: base.n + 1 };
}

/**
 * Pure, immutable rollup of a single review-feedback action into the per-component weights.
 * Returns a new object; never mutates `existing`.
 */
export function rollupReviewFeedback(
  existing: ReviewFeedbackWeights | null,
  action: { component: string; actionTaken: 'accepted' | 'ignored' | 'partial' },
): ReviewFeedbackWeights {
  const base: ReviewFeedbackWeights = existing ? { ...existing } : {};
  const prev: ComponentFeedback = base[action.component]
    ? { ...base[action.component] }
    : { accepted: 0, ignored: 0, partial: 0 };
  return {
    ...base,
    [action.component]: { ...prev, [action.actionTaken]: prev[action.actionTaken] + 1 },
  };
}
