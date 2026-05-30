import { describe, it, expect } from "vitest";
import { formatSignals } from "@/components/compositions/why-this-niche";

describe("formatSignals", () => {
  it("ranks available signals first, then by weight desc", () => {
    const rows = formatSignals({
      nicheAgeDays: 10,
      contributions: {
        provenScore: { value: 0.33, weight: 0.25, available: true },
        firstMoverScore: { value: 0, weight: 0.25, available: false },
        saturationInverse: { value: 0.62, weight: 0.15, available: true },
      },
    });
    expect(rows[0].available).toBe(true);
    expect(rows.find((r) => r.key === "firstMoverScore")?.available).toBe(false);
    // available rows sorted by weight desc: provenScore(.25) before saturationInverse(.15)
    const avail = rows.filter((r) => r.available).map((r) => r.key);
    expect(avail).toEqual(["provenScore", "saturationInverse"]);
  });

  it("returns [] when there are no contributions", () => {
    expect(formatSignals({})).toEqual([]);
    expect(formatSignals({ contributions: {} })).toEqual([]);
  });

  it("maps known keys to human labels", () => {
    const rows = formatSignals({ contributions: { provenScore: { value: 0.5, weight: 0.25, available: true } } });
    expect(rows[0].label.toLowerCase()).toContain("proven");
  });
});
