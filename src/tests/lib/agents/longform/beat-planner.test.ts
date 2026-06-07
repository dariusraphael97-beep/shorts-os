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
  it("returns one beat per slice with an assembled, style-prefixed image prompt + SFX cues", async () => {
    // model returns exactly as many items (scene + sound) as there are beats
    vi.mocked(generateObject).mockImplementation(async (...allArgs: unknown[]) => {
      const opts = allArgs[0] as { prompt?: string };
      const n = Number(opts?.prompt?.match(/EXACTLY (\d+) items/)?.[1] ?? 1);
      return { object: { items: Array.from({ length: n }, (_, i) => ({ scene: `cinematic scene ${i}`, sound: i % 2 === 0 ? "a hawk screech" : "" })) } } as never;
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
    // even-index beats carry an SFX cue; empty sounds become undefined (no soundEffect key)
    expect(beats[0].soundEffect).toBe("a hawk screech");
    expect(beats[1]?.soundEffect).toBeUndefined();
  });

  it("falls back to the narration slice as the scene when the model fails", async () => {
    vi.mocked(generateObject).mockRejectedValueOnce(makeNoObjectErr()).mockRejectedValueOnce(makeNoObjectErr());
    const out = await runBeatPlanner(ctx());
    const beats = out.chapters[0].beats;
    expect(beats.length).toBeGreaterThanOrEqual(1);
    expect(beats[0].sceneDescription.length).toBeGreaterThan(0);
  });

  it("repairs a scene-count mismatch by padding/truncating to the beat count", async () => {
    vi.mocked(generateObject).mockResolvedValue({ object: { items: [{ scene: "only one scene", sound: "" }] } } as never);
    const out = await runBeatPlanner(ctx());
    const beats = out.chapters[0].beats;
    expect(beats.every((b) => b.sceneDescription.length > 0)).toBe(true);
  });

  it("prompts for simple literal doodle scenes (not documentary framing) for the stick-figure preset", async () => {
    let captured = "";
    vi.mocked(generateObject).mockImplementation(async (...allArgs: unknown[]) => {
      const opts = allArgs[0] as { prompt?: string };
      captured = opts?.prompt ?? "";
      const n = Number(captured.match(/EXACTLY (\d+) items/)?.[1] ?? 1);
      return { object: { items: Array.from({ length: n }, (_, i) => ({ scene: `a stick figure scene ${i}`, sound: "" })) } } as never;
    });
    await runBeatPlanner({
      styleBible: getStylePreset("stick-figure-animated"),
      playbook: EMPTY_LONGFORM_PLAYBOOK,
      chapters: [{ index: 0, title: "Why we wake at 3am", narration: "You wake up at 3am. Your brain starts racing. It feels endless." }],
    });
    const p = captured.toLowerCase();
    expect(p).toMatch(/sound|sfx/); // also asks for per-beat sound design
    expect(p).toMatch(/doodle|stick.?figure/);
    expect(p).toMatch(/vary|varied|different|fresh/); // visual variety — not the same picture every time
    expect(p).toMatch(/diagram|chart|metaphor|close-?up|object/); // varied visual approaches, not just "person in a room"
    expect(p).toContain("on-screen text"); // Zenn-style words to aid comprehension
    expect(p).toMatch(/few words|short phrase|not.*exactly one/); // flexible length, not a rigid single word
    expect(p).toContain("collage"); // must still forbid collages
    expect(p).not.toContain("documentary");
    expect(p).toMatch(/background|setting/);
    expect(p).toContain("do not include"); // drawing-STYLE words are added automatically, not by this model
  });

  it("keeps documentary framing for the cinematic preset", async () => {
    let captured = "";
    vi.mocked(generateObject).mockImplementation(async (...allArgs: unknown[]) => {
      const opts = allArgs[0] as { prompt?: string };
      captured = opts?.prompt ?? "";
      const n = Number(captured.match(/EXACTLY (\d+) items/)?.[1] ?? 1);
      return { object: { items: Array.from({ length: n }, (_, i) => ({ scene: `cinematic scene ${i}`, sound: "" })) } } as never;
    });
    await runBeatPlanner(ctx());
    expect(captured.toLowerCase()).toContain("documentary");
  });
});
