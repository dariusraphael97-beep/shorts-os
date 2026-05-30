import { describe, it, expect } from "vitest";
import { predictionInterval } from "@/lib/digest/prediction-interval";

describe("predictionInterval", () => {
  it("brackets avg_views with documented k-factors (0.4×..3.0×)", () => {
    expect(predictionInterval(10000, null)).toEqual({ lower: 4000, upper: 30000 });
  });
  it("widens the upper bound with higher velocity", () => {
    const slow = predictionInterval(10000, 1);
    const fast = predictionInterval(10000, 8);
    expect(fast.upper).toBeGreaterThan(slow.upper);
  });
  it("floors at 0 and handles null avg_views", () => {
    expect(predictionInterval(null, null)).toEqual({ lower: 0, upper: 0 });
  });
});
