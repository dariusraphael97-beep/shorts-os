// src/lib/niches/longform-topic.ts
// A niche cluster is a broad label ("backyard birds ranked"); the longform writer agent
// turns it into a specific scripted video. This maps the cluster to the pipeline's input.
// The operator can edit `topic` at the cockpit entry before planning (steerable per the checkpoint).

export interface LongformTopicClusterInput {
  canonical_topic: string;
  production_fit: string;
  /** Duration (seconds) of the niche's proven winning video, if known. Sets the target length. */
  winnerDurationSeconds?: number | null;
}

export interface LongformPipelineInput {
  topic: string;
  targetDurationSeconds: number;
}

/**
 * Default longform target — ~8 min. Niche videos are meant to be substantial
 * (target 7–9 min, up to 15), not 3-min shorts; the pipeline supports up to
 * MAX_DURATION_SECONDS (20 min) / 12 chapters. Operator-overridable per generate.
 */
export const DEFAULT_LONGFORM_DURATION_SECONDS = 480;

/** Min/max target for a niche longform video: 7–15 min. */
const MIN_NICHE_TARGET_SECONDS = 420;
const MAX_NICHE_TARGET_SECONDS = 900;

/** Target length for a niche video: match the proven winner, clamped to 7–15 min; else the default. */
export function targetFromWinnerDuration(winnerDurationSeconds?: number | null): number {
  if (winnerDurationSeconds == null || !Number.isFinite(winnerDurationSeconds)) {
    return DEFAULT_LONGFORM_DURATION_SECONDS;
  }
  return Math.min(MAX_NICHE_TARGET_SECONDS, Math.max(MIN_NICHE_TARGET_SECONDS, Math.round(winnerDurationSeconds)));
}

export function clusterToLongformInput(c: LongformTopicClusterInput): LongformPipelineInput {
  if (c.production_fit !== "native") {
    throw new Error(
      `clusterToLongformInput: only 'native' production_fit auto-generates (got '${c.production_fit}')`,
    );
  }
  return {
    topic: c.canonical_topic.trim(),
    targetDurationSeconds: targetFromWinnerDuration(c.winnerDurationSeconds),
  };
}
