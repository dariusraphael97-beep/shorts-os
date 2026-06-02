import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/ai/gateway", () => ({ getClaudeModel: vi.fn(() => ({ __mock: "model" })) }));
vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return { ...actual, generateObject: vi.fn() };
});
import { generateObject, NoObjectGeneratedError } from "ai";
import { runBeatPlanner } from "@/lib/agents/longform/beat-planner";
import { getStylePreset } from "@/lib/longform/style-presets";
import { EMPTY_LONGFORM_PLAYBOOK } from "@/lib/agents/longform/playbook";

function makeNoObjectErr(): NoObjectGeneratedError {
  return new NoObjectGeneratedError({
    message: "No object generated: response did not match schema.",
    response: { id: "r", timestamp: new Date(), modelId: "m" },
    usage: {
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
      inputTokenDetails: { noCacheTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
      outputTokenDetails: { textTokens: 1, reasoningTokens: 0 },
    },
    finishReason: "stop",
  });
}

beforeEach(() => vi.mocked(generateObject).mockReset());

const ctx = () => ({
  styleBible: getStylePreset("cinematic-realistic"),
  playbook: EMPTY_LONGFORM_PLAYBOOK,
  chapters: [{ index: 0, title: "Reveal", narration: "A man walks on. The lights dim. Behind him, a glass ring. But it is under the sea." }],
});

describe("longform/beat-planner", () => {
  it("returns one beat per slice with an assembled, style-prefixed image prompt", async () => {
    // model returns exactly as many scenes as there are beats
    vi.mocked(generateObject).mockImplementation(async (...allArgs: unknown[]) => {
      const opts = allArgs[0] as { prompt?: string };
      const n = Number(opts?.prompt?.match(/EXACTLY (\d+) scenes/)?.[1] ?? 1);
      return { object: { scenes: Array.from({ length: n }, (_, i) => `cinematic scene ${i}`) } } as never;
    });
    const out = await runBeatPlanner(ctx());
    expect(out.chapters).toHaveLength(1);
    const beats = out.chapters[0].beats;
    expect(beats.length).toBeGreaterThanOrEqual(1);
    beats.forEach((b, i) => {
      expect(b.index).toBe(i);
      expect(b.imagePrompt.startsWith(getStylePreset("cinematic-realistic").positivePrefix)).toBe(true);
      expect(b.negativePrompt).toBe(getStylePreset("cinematic-realistic").negativePrompt);
    });
  });

  it("falls back to the narration slice as the scene when the model fails", async () => {
    vi.mocked(generateObject).mockRejectedValueOnce(makeNoObjectErr()).mockRejectedValueOnce(makeNoObjectErr());
    const out = await runBeatPlanner(ctx());
    const beats = out.chapters[0].beats;
    expect(beats.length).toBeGreaterThanOrEqual(1);
    expect(beats[0].sceneDescription.length).toBeGreaterThan(0);
  });

  it("repairs a scene-count mismatch by padding/truncating to the beat count", async () => {
    vi.mocked(generateObject).mockResolvedValue({ object: { scenes: ["only one scene"] } } as never);
    const out = await runBeatPlanner(ctx());
    const beats = out.chapters[0].beats;
    expect(beats.every((b) => b.sceneDescription.length > 0)).toBe(true);
  });
});
