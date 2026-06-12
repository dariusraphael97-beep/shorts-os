import { describe, it, expect } from "vitest";
import { buildKenBurnsFilter, KEN_BURNS_DIRECTIONS } from "@/lib/longform/ken-burns";

describe("longform/ken-burns", () => {
  it("builds a zoompan filter that ends at the 1920x1080 output size", () => {
    const f = buildKenBurnsFilter({ durationSeconds: 4, fps: 30, direction: "in", zoom: 0.06 });
    expect(f).toContain("zoompan");
    expect(f).toContain("s=1920x1080");
    expect(f).toContain("d=120"); // 4s * 30fps
    expect(f).toContain("fps=30");
  });

  it("supports every declared direction without throwing", () => {
    for (const direction of KEN_BURNS_DIRECTIONS) {
      expect(() => buildKenBurnsFilter({ durationSeconds: 3, fps: 30, direction, zoom: 0.05 })).not.toThrow();
    }
  });

  it("rounds frame count and guards a minimum of 1 frame", () => {
    const f = buildKenBurnsFilter({ durationSeconds: 0.01, fps: 30, direction: "in", zoom: 0.05 });
    expect(f).toContain("d=1");
  });
});
