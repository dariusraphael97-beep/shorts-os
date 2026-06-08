// src/tests/lib/niches/longform-topic.test.ts
import { describe, it, expect } from "vitest";
import { clusterToLongformInput } from "@/lib/niches/longform-topic";

describe("clusterToLongformInput", () => {
  it("maps a native niche cluster to a longform topic + target duration", () => {
    const input = clusterToLongformInput({
      canonical_topic: "backyard birds ranked",
      production_fit: "native",
    });
    expect(input.topic).toBe("backyard birds ranked");
    expect(input.targetDurationSeconds).toBe(210);
  });

  it("throws for non-native production fit (cannot auto-generate)", () => {
    expect(() =>
      clusterToLongformInput({ canonical_topic: "asmr carving", production_fit: "needs_manual_recording" }),
    ).toThrow(/native/);
  });
});
