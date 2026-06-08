// src/tests/lib/niches/auto-pick.test.ts
import { describe, it, expect } from "vitest";
import { pickBestNiche, type PickableCluster } from "@/lib/niches/auto-pick";

const base = (over: Partial<PickableCluster>): PickableCluster => ({
  id: "x", canonical_topic: "t", production_fit: "native",
  niche_score: 0.5, proven_score: 0.1, first_mover_score: 0.1, ...over,
});

describe("pickBestNiche", () => {
  it("returns null when there are no native, banded clusters", () => {
    expect(pickBestNiche([])).toBeNull();
    expect(pickBestNiche([base({ production_fit: "manual_only", first_mover_score: 0.9 })])).toBeNull();
    expect(pickBestNiche([base({ first_mover_score: 0.1, proven_score: 0.1 })])).toBeNull(); // band "none"
  });

  it("prefers the highest first-mover (dominatable) native cluster", () => {
    const picked = pickBestNiche([
      base({ id: "a", first_mover_score: 0.75, niche_score: 0.6 }),
      base({ id: "b", first_mover_score: 0.92, niche_score: 0.55 }),
      base({ id: "c", proven_score: 0.8, first_mover_score: 0.1, niche_score: 0.9 }),
    ]);
    expect(picked?.cluster.id).toBe("b");
    expect(picked?.band).toBe("unproven");
    expect(picked?.reason).toMatch(/first-mover|dominatable/i);
  });

  it("falls back to the highest niche_score proven cluster when no dominatable exists", () => {
    const picked = pickBestNiche([
      base({ id: "p1", proven_score: 0.7, first_mover_score: 0.1, niche_score: 0.65 }),
      base({ id: "p2", proven_score: 0.8, first_mover_score: 0.1, niche_score: 0.82 }),
    ]);
    expect(picked?.cluster.id).toBe("p2");
    expect(picked?.band).toBe("proven");
  });
});
