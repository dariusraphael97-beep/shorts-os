import { describe, it, expect } from "vitest";
import { averageSignalContributions, actionCorrelation, predictionAccuracy } from "@/lib/admin/scoring-analysis";

describe("averageSignalContributions", () => {
  it("averages each signal key across clusters that report it", () => {
    const out = averageSignalContributions([
      { explainability_top_signals: { velocity: 2, outlier: 4 } },
      { explainability_top_signals: { velocity: 4 } },
    ]);
    expect(out.velocity).toBe(3);
    expect(out.outlier).toBe(4);
  });
  it("returns {} for no clusters", () => {
    expect(averageSignalContributions([])).toEqual({});
  });
});

describe("actionCorrelation", () => {
  it("splits clusters into acted vs negative and averages each score component", () => {
    const clusters = [
      { id: "a", first_mover_score: 10, proven_score: 2, niche_score: 8 },
      { id: "b", first_mover_score: 2, proven_score: 6, niche_score: 4 },
    ];
    const actionsByCluster = {
      a: { viewed: 1, investigated: 1, generated_from: 0, dismissed: 0, hidden: 0 },
      b: { viewed: 1, investigated: 0, generated_from: 0, dismissed: 1, hidden: 0 },
    };
    const out = actionCorrelation(clusters, actionsByCluster);
    expect(out.actedCount).toBe(1);
    expect(out.negativeCount).toBe(1);
    expect(out.actedAvg.first_mover_score).toBe(10);
    expect(out.negativeAvg.proven_score).toBe(6);
  });
  it("reports zero counts when there are no actions", () => {
    const out = actionCorrelation([{ id: "a", first_mover_score: 1, proven_score: 1, niche_score: 1 }], {});
    expect(out.actedCount).toBe(0);
    expect(out.negativeCount).toBe(0);
  });
});

describe("predictionAccuracy", () => {
  it("returns null when nothing is closed", () => {
    expect(predictionAccuracy([])).toBeNull();
  });
  it("counts verdicts and computes percentages", () => {
    const out = predictionAccuracy([
      { accuracy_verdict: "within" }, { accuracy_verdict: "within" },
      { accuracy_verdict: "above" }, { accuracy_verdict: "below" },
    ]);
    expect(out).not.toBeNull();
    expect(out!.total).toBe(4);
    expect(out!.within).toBe(2);
    expect(out!.withinPct).toBe(50);
  });
});
