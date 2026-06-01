import { describe, it, expect } from "vitest";
import { resolveGenerationResult, chipStatesFromProgress } from "@/lib/agents/generation-status";

describe("resolveGenerationResult", () => {
  it("returns null while the job is still running", () => {
    expect(resolveGenerationResult({ jobStatus: "running", yourVideoId: null, compilationDraftId: null })).toBeNull();
  });
  it("returns your_video when a your_videos row exists on success", () => {
    expect(resolveGenerationResult({ jobStatus: "succeeded", yourVideoId: "yv1", compilationDraftId: "cd1" }))
      .toEqual({ kind: "your_video", videoId: "yv1" });
  });
  it("returns compilation when only a compilation draft exists on success", () => {
    expect(resolveGenerationResult({ jobStatus: "succeeded", yourVideoId: null, compilationDraftId: "cd1" }))
      .toEqual({ kind: "compilation", draftId: "cd1" });
  });
});

describe("chipStatesFromProgress", () => {
  it("marks agents before the current one done, current working, rest idle", () => {
    const s = chipStatesFromProgress({ currentAgent: "voice_coach", status: "running" });
    expect(s.strategist).toBe("done");
    expect(s.writer).toBe("done");
    expect(s.voice_coach).toBe("working");
    expect(s.director).toBe("idle");
  });
  it("marks everything done on success", () => {
    const s = chipStatesFromProgress({ currentAgent: "director", status: "succeeded" });
    expect(s.strategist).toBe("done");
    expect(s.director).toBe("done");
  });
  it("marks the current agent failed on failure", () => {
    const s = chipStatesFromProgress({ currentAgent: "writer", status: "failed" });
    expect(s.strategist).toBe("done");
    expect(s.writer).toBe("failed");
    expect(s.voice_coach).toBe("idle");
  });
});
