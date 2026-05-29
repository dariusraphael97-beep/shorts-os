import { describe, it, expect } from "vitest";
import { DURATION, EASE, SPRING, fadeRise, modalScale } from "@/lib/motion";

describe("motion tokens", () => {
  it("exposes spec durations in seconds", () => {
    expect(DURATION.instant).toBe(0.1);
    expect(DURATION.quick).toBe(0.2);
    expect(DURATION.smooth).toBe(0.32);
    expect(DURATION.slow).toBe(0.5);
  });
  it("exposes the standard state-change cubic-bezier", () => {
    expect(EASE.standard).toEqual([0.4, 0, 0.2, 1]);
  });
  it("exposes the delight spring", () => {
    expect(SPRING).toMatchObject({ type: "spring", stiffness: 400, damping: 30 });
  });
  it("fadeRise animates opacity + small y with the smooth duration", () => {
    expect(fadeRise.initial).toEqual({ opacity: 0, y: 8 });
    expect(fadeRise.animate).toMatchObject({ opacity: 1, y: 0 });
  });
  it("modalScale uses scale+opacity for dialog content", () => {
    expect(modalScale.initial).toMatchObject({ opacity: 0, scale: 0.96 });
  });
});
