import { describe, it, expect } from "vitest";
import { isoWeekStart, partitionBands, type BandableCluster } from "@/lib/niches/current-week";

const c = (id: string, niche: number, proven: number | null, fm: number | null): BandableCluster =>
  ({ id, niche_score: niche, proven_score: proven, first_mover_score: fm, digest_rank: 1 });

describe("isoWeekStart", () => {
  it("returns the Monday (UTC) as YYYY-MM-DD", () => {
    expect(isoWeekStart(new Date("2026-05-29T00:00:00Z"))).toBe("2026-05-25");
  });
});

describe("partitionBands", () => {
  it("splits proven (proven_score>0.6) from trending-unproven (first_mover>0.7)", () => {
    const { proven, unproven } = partitionBands([c("a", 0.9, 0.7, 0.2), c("b", 0.8, 0.3, 0.9), c("c", 0.5, 0.2, 0.1)]);
    expect(proven.map((x) => x.id)).toEqual(["a"]);
    expect(unproven.map((x) => x.id)).toEqual(["b"]);
  });
});
