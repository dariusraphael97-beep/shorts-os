import { describe, it, expect } from "vitest";
import { FORMAT_LABELS, AUDIENCE_SIGNALS, formatToProductionFit, PRODUCTION_FIT_WEIGHT } from "@/lib/classifier/taxonomy";

describe("taxonomy", () => {
  it("has all 18 format labels", () => {
    expect(FORMAT_LABELS).toHaveLength(18);
    expect(new Set(FORMAT_LABELS).size).toBe(18);
  });

  it("has 7 audience signals", () => {
    expect(AUDIENCE_SIGNALS).toHaveLength(7);
  });

  it("maps every format label to a production_fit", () => {
    for (const f of FORMAT_LABELS) {
      expect(["native", "needs_manual_recording", "needs_manual_editing", "manual_only"])
        .toContain(formatToProductionFit(f));
    }
  });

  it("maps representative labels per the spec table", () => {
    expect(formatToProductionFit("ai_voiceover_facts")).toBe("native");
    expect(formatToProductionFit("talking_head_advice")).toBe("needs_manual_recording");
    expect(formatToProductionFit("pov_skit")).toBe("needs_manual_editing");
    expect(formatToProductionFit("other")).toBe("manual_only");
  });

  it("weights fits native>recording>editing>manual_only", () => {
    expect(PRODUCTION_FIT_WEIGHT.native).toBe(1.0);
    expect(PRODUCTION_FIT_WEIGHT.needs_manual_recording).toBe(0.7);
    expect(PRODUCTION_FIT_WEIGHT.needs_manual_editing).toBe(0.5);
    expect(PRODUCTION_FIT_WEIGHT.manual_only).toBe(0.2);
  });
});
