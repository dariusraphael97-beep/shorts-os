import { describe, it, expect } from "vitest";
import { buildSparklinePath, sparklineTrend } from "@/lib/design/sparkline";

describe("buildSparklinePath", () => {
  it("returns empty string for <2 points", () => {
    expect(buildSparklinePath([], 100, 24)).toBe("");
    expect(buildSparklinePath([5], 100, 24)).toBe("");
  });
  it("starts with a moveto and spans the width", () => {
    const d = buildSparklinePath([0, 5, 10], 100, 24);
    expect(d.startsWith("M0")).toBe(true);
    expect(d).toContain("L100");
  });
  it("flat series maps to the vertical midpoint", () => {
    const d = buildSparklinePath([4, 4, 4], 100, 24);
    expect(d).toContain("12");
  });
});

describe("sparklineTrend", () => {
  it("classifies direction from first vs last", () => {
    expect(sparklineTrend([1, 2, 5])).toBe("up");
    expect(sparklineTrend([5, 2, 1])).toBe("down");
    expect(sparklineTrend([3, 3, 3])).toBe("flat");
  });
});
