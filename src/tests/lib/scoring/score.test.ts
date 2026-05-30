import { describe, it, expect } from "vitest";
import { computeNicheScore, type ScoreComponents } from "@/lib/scoring/score";

const base: ScoreComponents = {
  firstMoverScore: 0.8,
  provenScore: 0.6,
  saturationInverse: 0.5,
  productionFitWeight: 1.0,
  discoveryStateWeight: 1.0,
  outlierDensity: 0.4,
};

describe("computeNicheScore", () => {
  it("computes the full weighted mean when all components present", () => {
    const { score, contributions } = computeNicheScore(base);
    // 0.25*0.8 + 0.25*0.6 + 0.15*0.5 + 0.15*1.0 + 0.10*1.0 + 0.10*0.4 = 0.715, denom = 1.0
    expect(score).toBeCloseTo(0.715, 3);
    expect(contributions.firstMoverScore?.available).toBe(true);
  });

  it("renormalizes over available weights when a component is null", () => {
    const { score } = computeNicheScore({ ...base, provenScore: null });
    // numerator = 0.715 - 0.25*0.6 = 0.565 ; denom = 1.0 - 0.25 = 0.75
    expect(score).toBeCloseTo(0.565 / 0.75, 4);
  });

  it("never divides by zero (always-present components keep denom > 0)", () => {
    const { score } = computeNicheScore({
      firstMoverScore: null, provenScore: null, outlierDensity: null,
      saturationInverse: 0.3, productionFitWeight: 0.7, discoveryStateWeight: 0.5,
    });
    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBeGreaterThan(0);
  });

  it("marks null components as unavailable in contributions (explainability)", () => {
    const { contributions } = computeNicheScore({ ...base, provenScore: null });
    expect(contributions.provenScore?.available).toBe(false);
    expect(contributions.firstMoverScore?.available).toBe(true);
  });
});
