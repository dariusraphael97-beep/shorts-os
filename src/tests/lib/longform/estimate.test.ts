// src/tests/lib/longform/estimate.test.ts
import { describe, it, expect } from "vitest";
import { estimateRender } from "@/lib/longform/estimate";

describe("estimateRender", () => {
  it("estimates credits + minutes for a 68-beat nano_banana_2 run at concurrency 2", () => {
    const e = estimateRender({ beatCount: 68, model: "nano_banana_2", concurrency: 2 });
    expect(e.credits).toBe(136); // 68 beats * 2 cr/image
    expect(e.minutes).toBe(17);  // ceil(68/2)*28s + 90s overhead ≈ 1042s
  });

  it("uses a cheaper, faster profile for gpt_image_2", () => {
    const e = estimateRender({ beatCount: 40, model: "gpt_image_2", concurrency: 3 });
    expect(e.credits).toBe(30);  // 40 * 0.75
    expect(e.minutes).toBe(4);   // ceil(40/3)*10s + 90s = 230s
  });

  it("falls back to a default profile for an unknown model", () => {
    const e = estimateRender({ beatCount: 10, model: "mystery_model" });
    expect(e.credits).toBe(15);  // 10 * 1.5
    expect(e.minutes).toBeGreaterThan(0);
  });
});
