import { describe, it, expect } from "vitest";
import { formatCompactNumber, formatVelocity, formatShortcut } from "@/lib/design/format";

describe("formatCompactNumber", () => {
  it("compacts thousands/millions", () => {
    expect(formatCompactNumber(950)).toBe("950");
    expect(formatCompactNumber(12345)).toBe("12.3K");
    expect(formatCompactNumber(1_500_000)).toBe("1.5M");
  });
  it("handles zero and negatives", () => {
    expect(formatCompactNumber(0)).toBe("0");
    expect(formatCompactNumber(-2400)).toBe("-2.4K");
  });
});

describe("formatVelocity", () => {
  it("appends a per-window unit", () => {
    expect(formatVelocity(12345, "24h")).toBe("12.3K / 24h");
  });
});

describe("formatShortcut", () => {
  it("joins keys with no separator (kbd chips render spacing)", () => {
    expect(formatShortcut(["⌘", "K"])).toBe("⌘K");
  });
});
