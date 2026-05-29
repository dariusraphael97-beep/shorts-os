import { describe, it, expect } from "vitest";
import {
  discoveryStateBadge, provenBandBadge, productionFitBadge,
  outlierTier, assistantStatusTone,
} from "@/lib/design/badges";

describe("discoveryStateBadge", () => {
  it("maps each known state to a tone + label", () => {
    expect(discoveryStateBadge("discovered")).toEqual({ label: "Discovered", tone: "accent" });
    expect(discoveryStateBadge("emerging")).toEqual({ label: "Emerging", tone: "warning" });
    expect(discoveryStateBadge("validated")).toEqual({ label: "Validated", tone: "success" });
    expect(discoveryStateBadge("saturated")).toEqual({ label: "Saturated", tone: "muted" });
  });
  it("falls back gracefully for unknown strings", () => {
    expect(discoveryStateBadge("???")).toEqual({ label: "Unknown", tone: "muted" });
  });
});
describe("provenBandBadge", () => {
  it("labels proven bands", () => {
    expect(provenBandBadge("proven").label).toBe("Proven");
    expect(provenBandBadge("first_mover").label).toBe("First-mover");
  });
});
describe("productionFitBadge", () => {
  it("maps fit categories to tone", () => {
    expect(productionFitBadge("high").tone).toBe("success");
    expect(productionFitBadge("medium").tone).toBe("warning");
    expect(productionFitBadge("low").tone).toBe("danger");
  });
});
describe("outlierTier", () => {
  it("buckets an outlier multiplier into a tier", () => {
    expect(outlierTier(1.2)).toBe("none");
    expect(outlierTier(3)).toBe("strong");
    expect(outlierTier(10)).toBe("extreme");
  });
});
describe("assistantStatusTone", () => {
  it("maps status to a tone", () => {
    expect(assistantStatusTone("idle")).toBe("muted");
    expect(assistantStatusTone("working")).toBe("accent");
    expect(assistantStatusTone("waiting")).toBe("warning");
    expect(assistantStatusTone("errored")).toBe("danger");
  });
});
