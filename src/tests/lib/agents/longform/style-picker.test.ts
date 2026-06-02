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
    vi.mocked(generateObject).mockResolvedValue({ object: { presetId: "editorial-graphic", musicMood: "tense corporate", rationale: "a finance explainer reads cleaner as bold editorial graphics than photoreal footage." } } as never);
    const out = await runStylePicker(ctx());
    expect(out.presetId).toBe("editorial-graphic");
    expect(out.styleBible.presetId).toBe("editorial-graphic");
    expect(out.styleBible.musicMood).toBe("tense corporate");
    expect(out.musicMood).toBe("tense corporate");
  });

  it("falls back to cinematic-realistic when the model keeps failing", async () => {
    vi.mocked(generateObject).mockRejectedValueOnce(makeNoObjectErr()).mockRejectedValueOnce(makeNoObjectErr());
    const out = await runStylePicker(ctx());
    expect(out.presetId).toBe("cinematic-realistic");
    expect(out.styleBible.aspect).toBe("16:9");
  });
});
