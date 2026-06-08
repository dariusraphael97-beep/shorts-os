// src/lib/niches/longform-topic.ts
// A niche cluster is a broad label ("backyard birds ranked"); the longform writer agent
// turns it into a specific scripted video. This maps the cluster to the pipeline's input.
// The operator can edit `topic` at the cockpit entry before planning (steerable per the checkpoint).

export interface LongformTopicClusterInput {
  canonical_topic: string;
  production_fit: string;
}

export interface LongformPipelineInput {
  topic: string;
  targetDurationSeconds: number;
}

/** Default longform target — ~3.5 min, matching the proven B58 / bird renders. */
export const DEFAULT_LONGFORM_DURATION_SECONDS = 210;

export function clusterToLongformInput(c: LongformTopicClusterInput): LongformPipelineInput {
  if (c.production_fit !== "native") {
    throw new Error(
      `clusterToLongformInput: only 'native' production_fit auto-generates (got '${c.production_fit}')`,
    );
  }
  return {
    topic: c.canonical_topic.trim(),
    targetDurationSeconds: DEFAULT_LONGFORM_DURATION_SECONDS,
  };
}
