import { NICHE_WEIGHTS, type ScoreComponentKey } from "@/lib/scoring/weights";

export type ScoreComponents = Record<ScoreComponentKey, number | null>;

export interface Contribution { value: number; weight: number; available: boolean }
export interface NicheScoreResult {
  score: number;
  contributions: Partial<Record<ScoreComponentKey, Contribution>>;
}

/** Renormalizing weighted mean over the non-null components. */
export function computeNicheScore(components: ScoreComponents): NicheScoreResult {
  const contributions: Partial<Record<ScoreComponentKey, Contribution>> = {};
  let num = 0;
  let denom = 0;
  for (const key of Object.keys(NICHE_WEIGHTS) as ScoreComponentKey[]) {
    const weight = NICHE_WEIGHTS[key];
    const value = components[key];
    const available = value !== null && value !== undefined && Number.isFinite(value);
    contributions[key] = { value: available ? (value as number) : 0, weight, available };
    if (available) { num += weight * (value as number); denom += weight; }
  }
  return { score: denom > 0 ? num / denom : 0, contributions };
}
