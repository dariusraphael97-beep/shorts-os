import { describe, it, expect } from "vitest";
import { validateSettings } from "@/lib/agents/settings/schemas";

describe("validateSettings", () => {
  it("accepts a valid niche_scout settings object", () => {
    const result = validateSettings("niche_scout", {
      model: "claude-opus-4-5",
      proven_vs_firstmover: 0.6,
      confidence_floor: 0.8,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proven_vs_firstmover).toBe(0.6);
    }
  });

  it("rejects an out-of-range slider value with an error string", () => {
    const result = validateSettings("niche_scout", {
      proven_vs_firstmover: 1.5, // max is 1
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(typeof result.error).toBe("string");
      expect(result.error.length).toBeGreaterThan(0);
      expect(result.error).toContain("proven_vs_firstmover");
    }
  });

  it("passes through settings for an unknown assistant id (passthrough schema)", () => {
    const result = validateSettings("unknown_assistant_xyz", {
      someArbitraryKey: "value",
      anotherKey: 42,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.someArbitraryKey).toBe("value");
    }
  });

  it("rejects a video_reviewer block_threshold below 0", () => {
    const result = validateSettings("video_reviewer", {
      block_threshold: -0.1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("block_threshold");
    }
  });
});
