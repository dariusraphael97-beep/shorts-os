import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/ai/gateway", () => ({ getClaudeModel: vi.fn(() => ({ __mock: "model" })) }));
vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return { ...actual, generateObject: vi.fn() };
});
import { generateObject, NoObjectGeneratedError } from "ai";
import { runStylePicker } from "@/lib/agents/longform/style-picker";
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
const ctx = () => ({ topic: "The IRS is hiding this from you", angle: "a", playbook: EMPTY_LONGFORM_PLAYBOOK });

describe("longform/style-picker", () => {
  it("resolves the chosen preset into a full style bible with the chosen music mood", async () => {
    vi.mocked(generateObject).mockResolvedValue({ object: { presetId: "technical-illustration", musicMood: "tense corporate", rationale: "an engineering how-it-works topic reads cleaner as a clean labeled cutaway diagram." } } as never);
    const out = await runStylePicker(ctx());
    expect(out.presetId).toBe("technical-illustration");
    expect(out.styleBible.presetId).toBe("technical-illustration");
    expect(out.styleBible.musicMood).toBe("tense corporate");
    expect(out.musicMood).toBe("tense corporate");
  });

  it("falls back to naturalist-illustration when the model keeps failing", async () => {
    vi.mocked(generateObject).mockRejectedValueOnce(makeNoObjectErr()).mockRejectedValueOnce(makeNoObjectErr());
    const out = await runStylePicker(ctx());
    expect(out.presetId).toBe("naturalist-illustration");
    expect(out.styleBible.aspect).toBe("16:9");
  });

  it("offers the stick-figure (Zenn) preset as a selectable option", async () => {
    let captured = "";
    vi.mocked(generateObject).mockImplementation(async (...allArgs: unknown[]) => {
      const opts = allArgs[0] as { prompt?: string };
      captured = opts?.prompt ?? "";
      return { object: { presetId: "naturalist-illustration", musicMood: "calm bed", rationale: "a rationale comfortably past the minimum length validation." } } as never;
    });
    await runStylePicker(ctx());
    expect(captured).toContain("stick-figure-animated");
    expect(captured.toLowerCase()).toMatch(/stick.?figure|doodle|zenn/);
  });

  it("resolves the stick-figure preset into its style bible when chosen", async () => {
    vi.mocked(generateObject).mockResolvedValue({ object: { presetId: "stick-figure-animated", musicMood: "quirky", rationale: "a playful relatable explainer reads best as crude hand-drawn stick-figure doodles." } } as never);
    const out = await runStylePicker(ctx());
    expect(out.presetId).toBe("stick-figure-animated");
    expect(out.styleBible.presetId).toBe("stick-figure-animated");
    expect(out.styleBible.positivePrefix.toLowerCase()).toMatch(/stick.?figure|stickman/);
  });
});
