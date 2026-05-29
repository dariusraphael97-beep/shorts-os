import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

describe("design tokens", () => {
  it("uses the Apple system-blue accent (not legacy neon green)", () => {
    expect(css).toMatch(/--accent:\s*#0a84ff/);
    expect(css).not.toMatch(/--accent:\s*#00ff88/);
  });
  it("defines the dark surface ramp from the spec", () => {
    expect(css).toMatch(/--bg:\s*#0a0a0b/);
    expect(css).toMatch(/--surface-1:\s*#131315/);
    expect(css).toMatch(/--surface-2:\s*#1b1b1e/);
  });
  it("defines the full type scale", () => {
    for (const t of ["--text-xs", "--text-sm", "--text-base", "--text-lg", "--text-xl", "--text-2xl", "--text-3xl", "--text-4xl"]) {
      expect(css).toContain(t);
    }
  });
  it("defines spec radii (6/10/16/24)", () => {
    expect(css).toMatch(/--radius-sm:\s*6px/);
    expect(css).toMatch(/--radius-md:\s*10px/);
    expect(css).toMatch(/--radius-lg:\s*16px/);
    expect(css).toMatch(/--radius-xl:\s*24px/);
  });
  it("defines motion duration + translucency tokens", () => {
    expect(css).toMatch(/--duration-instant:\s*100ms/);
    expect(css).toMatch(/--duration-smooth:\s*320ms/);
    expect(css).toContain("blur(20px) saturate(180%)");
  });
  it("preserves legacy tokens so old pages still build", () => {
    expect(css).toContain("--accent-electric");
    expect(css).toContain("@keyframes marquee");
  });
});
