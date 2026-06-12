// src/tests/app/niches/studio/status-route.test.ts
import { describe, it, expect } from "vitest";
import { deriveStudioPhase, isWorkerStale } from "@/app/api/niches/studio/[draftId]/status/route";

describe("deriveStudioPhase", () => {
  it("checkpoint when draft + plan present, no render", () => {
    expect(deriveStudioPhase({ status: "draft", longform_plan: { hook: "h" } }, null)).toBe("checkpoint");
  });
  it("planning when draft + no plan yet", () => {
    expect(deriveStudioPhase({ status: "draft", longform_plan: null }, null)).toBe("planning");
  });
  it("rendering when status rendering", () => {
    expect(deriveStudioPhase({ status: "rendering", longform_plan: { hook: "h" } }, { status: "running" })).toBe("rendering");
  });
  it("done when rendered", () => {
    expect(deriveStudioPhase({ status: "rendered", longform_plan: { hook: "h" } }, { status: "succeeded" })).toBe("done");
  });
  it("error when failed", () => {
    expect(deriveStudioPhase({ status: "failed", longform_plan: { hook: "h" } }, { status: "failed" })).toBe("error");
  });
});

describe("isWorkerStale", () => {
  it("true when a job has sat pending with no claim past the threshold", () => {
    const old = new Date(Date.now() - 90_000).toISOString();
    expect(isWorkerStale({ status: "pending", claimed_at: null, created_at: old }, 60_000)).toBe(true);
  });
  it("false when claimed", () => {
    const old = new Date(Date.now() - 90_000).toISOString();
    expect(isWorkerStale({ status: "claimed", claimed_at: old, created_at: old }, 60_000)).toBe(false);
  });
  it("false when pending but still fresh", () => {
    const now = new Date().toISOString();
    expect(isWorkerStale({ status: "pending", claimed_at: null, created_at: now }, 60_000)).toBe(false);
  });
});
