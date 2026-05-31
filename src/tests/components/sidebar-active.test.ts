import { describe, it, expect } from "vitest";
import { resolveActiveHref } from "@/components/layout/sidebar-active";

const HREFS = [
  "/mission-control", "/niches", "/lab", "/clips",
  "/niches/watch-list", "/competitors", "/settings",
];

describe("resolveActiveHref", () => {
  it("matches an exact path", () => {
    expect(resolveActiveHref("/niches", HREFS)).toBe("/niches");
  });
  it("matches a sub-route to its section root (longest prefix)", () => {
    expect(resolveActiveHref("/lab/drafts", HREFS)).toBe("/lab");
    expect(resolveActiveHref("/settings/channel", HREFS)).toBe("/settings");
    expect(resolveActiveHref("/niches/abc-123", HREFS)).toBe("/niches");
  });
  it("prefers the more specific item when two prefixes match", () => {
    expect(resolveActiveHref("/niches/watch-list", HREFS)).toBe("/niches/watch-list");
  });
  it("returns null when nothing matches", () => {
    expect(resolveActiveHref("/unknown", HREFS)).toBeNull();
  });
  it("does not treat a partial segment as a prefix", () => {
    expect(resolveActiveHref("/competitor", HREFS)).toBeNull();
  });
});
