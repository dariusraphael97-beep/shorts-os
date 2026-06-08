import { describe, it, expect } from "vitest";
import { AUTO_ELIGIBLE_PRESETS, DEFAULT_AUTO_PRESET } from "@/lib/agents/longform/style-picker";

describe("style picker auto policy", () => {
  it("only offers the proven illustrated presets — never the photoreal soul_v2 ones", () => {
    expect(AUTO_ELIGIBLE_PRESETS).toEqual([
      "naturalist-illustration",
      "technical-illustration",
      "stick-figure-animated",
    ]);
    expect(AUTO_ELIGIBLE_PRESETS).not.toContain("cinematic-realistic");
    expect(AUTO_ELIGIBLE_PRESETS).not.toContain("editorial-graphic");
  });

  it("defaults/falls back to the proven naturalist illustration", () => {
    expect(DEFAULT_AUTO_PRESET).toBe("naturalist-illustration");
  });
});
