import { describe, it, expect } from "vitest";
import { FactSheetSchema } from "@/lib/agents/longform/types";

describe("FactSheetSchema", () => {
  it("accepts a sourced fact sheet", () => {
    const fs = FactSheetSchema.parse({
      facts: [{ claim: "Stage 1 makes ~500whp", detail: "tune+intake+downpipe, stock turbo", sourceUrl: "https://x.com/a" }],
      uncertain: ["exact ZF8 rebuild cost varies by shop"],
    });
    expect(fs.facts).toHaveLength(1);
    expect(fs.uncertain).toHaveLength(1);
  });

  it("allows a fact with no sourceUrl and defaults empty arrays", () => {
    const fs = FactSheetSchema.parse({ facts: [{ claim: "c", detail: "d" }] });
    expect(fs.facts[0].sourceUrl).toBeUndefined();
    expect(fs.uncertain).toEqual([]);
  });

  it("rejects a fact missing claim", () => {
    expect(() => FactSheetSchema.parse({ facts: [{ detail: "d" }] })).toThrow();
  });
});
