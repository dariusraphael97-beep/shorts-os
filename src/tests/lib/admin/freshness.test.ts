import { describe, it, expect } from "vitest";
import { freshnessFor, EXPECTED_MAX_AGE_MS, type RunSummary } from "@/lib/admin/freshness";

const now = new Date("2026-05-29T12:00:00Z");
const summary = (over: Partial<RunSummary>): RunSummary => ({
  job: "google_trends", status: "success", startedAt: "2026-05-29T11:00:00Z", ...over,
});

describe("freshnessFor", () => {
  it("green when last run succeeded within the expected window", () => {
    expect(freshnessFor(summary({ status: "success" }), now).level).toBe("green");
  });
  it("red when the last run failed", () => {
    expect(freshnessFor(summary({ status: "failed" }), now).level).toBe("red");
  });
  it("amber when partial", () => {
    expect(freshnessFor(summary({ status: "partial" }), now).level).toBe("amber");
  });
  it("red when stale beyond 2x the expected cadence", () => {
    const old = new Date(now.getTime() - EXPECTED_MAX_AGE_MS.google_trends * 2.5).toISOString();
    expect(freshnessFor(summary({ status: "success", startedAt: old }), now).level).toBe("red");
  });
  it("red when never run (null)", () => {
    expect(freshnessFor(summary({ startedAt: null }), now).level).toBe("red");
  });
});
