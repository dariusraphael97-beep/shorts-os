import { describe, it, expect } from "vitest";
import { getStylePreset } from "@/lib/longform/style-presets";

describe("naturalist-illustration preset — no auto encyclopedic labels", () => {
  const p = getStylePreset("naturalist-illustration");
  it("drops the 'field guide' cue that makes the model add Latin labels", () => {
    expect(p.positivePrefix).not.toMatch(/field guide/i);
    expect(p.positivePrefix).toMatch(/storybook/i); // still the inked-watercolor aesthetic
  });
  it("records label-suppression terms in the negative prompt", () => {
    expect(p.negativePrompt).toMatch(/latin names/i);
    expect(p.negativePrompt).toMatch(/figure numbers/i);
  });
});
