import { describe, it, expect } from "vitest";
import { assignBand, selectDigest, type ScoredCandidate } from "@/lib/scoring/select";

const cand = (id: string, niche: number, proven: number, firstMover: number, emb: number[]): ScoredCandidate => ({
  id, nicheScore: niche, provenScore: proven, firstMoverScore: firstMover, embedding: emb,
});

describe("assignBand", () => {
  it("classifies proven vs unproven vs none", () => {
    expect(assignBand(cand("a", 0.8, 0.7, 0.2, [1]))).toBe("proven");
    expect(assignBand(cand("b", 0.8, 0.4, 0.8, [1]))).toBe("unproven");
    expect(assignBand(cand("c", 0.8, 0.4, 0.3, [1]))).toBe("none");
  });
});

describe("selectDigest", () => {
  it("fills proven and unproven quotas and ranks 1..N", () => {
    const candidates = [
      cand("p1", 0.9, 0.7, 0.2, [1, 0]),
      cand("p2", 0.85, 0.65, 0.2, [0.9, 0.1]),
      cand("u1", 0.8, 0.3, 0.9, [0, 1]),
      cand("u2", 0.75, 0.3, 0.85, [0.1, 0.9]),
    ];
    const ranked = selectDigest(candidates, { provenTarget: 1, unprovenTarget: 1, lambda: 0.7 });
    expect(ranked.map((r) => r.digestRank)).toEqual([1, 2]);
    const ids = ranked.map((r) => r.id);
    expect(ids).toContain("p1");
    expect(ids).toContain("u1");
  });

  it("returns empty when no candidates qualify for either band", () => {
    const ranked = selectDigest([cand("x", 0.5, 0.2, 0.1, [1])], { provenTarget: 2, unprovenTarget: 2, lambda: 0.7 });
    expect(ranked).toHaveLength(0);
  });
});
