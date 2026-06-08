// src/tests/lib/agents/longform/plan-only.test.ts
import { describe, it, expect } from "vitest";
import { shouldEnqueueRender } from "@/lib/agents/longform/orchestrator";

describe("shouldEnqueueRender (planOnly gate)", () => {
  it("enqueues a render by default (planOnly absent or false)", () => {
    expect(shouldEnqueueRender({})).toBe(true);
    expect(shouldEnqueueRender({ planOnly: false })).toBe(true);
  });
  it("skips the render when planOnly is true (operator checkpoint)", () => {
    expect(shouldEnqueueRender({ planOnly: true })).toBe(false);
  });
});
