// Starting weights (spec §4.4). Tunable later without code changes.
export const NICHE_WEIGHTS = {
  firstMoverScore: 0.25,
  provenScore: 0.25,
  saturationInverse: 0.15,
  productionFitWeight: 0.15,
  discoveryStateWeight: 0.10,
  outlierDensity: 0.10,
} as const;

export type ScoreComponentKey = keyof typeof NICHE_WEIGHTS;
