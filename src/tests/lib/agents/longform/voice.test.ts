import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/ai/gateway", () => ({ getClaudeModel: vi.fn(() => ({ __mock: "model" })) }));
vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return { ...actual, generateObject: vi.fn() };
});
import { generateObject, NoObjectGeneratedError } from "ai";
import { pickLongformVoice } from "@/lib/agents/voice-coach";
import { VOICE_POOL_IDS } from "@/lib/agents/constants";

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

describe("pickLongformVoice", () => {
  it("returns a voice from the shared pool at a measured speed", async () => {
    vi.mocked(generateObject).mockResolvedValue({ object: { voiceId: VOICE_POOL_IDS[3], provider: "cartesia", speed: 0.95, stability: 0.6, rationale: "deep, authoritative narrator suits a dramatic documentary cold open." } } as never);
    const out = await pickLongformVoice({ topic: "t", narrationSample: "A man walks on. The lights dim.", playbook: { voice: { bestVoiceIdByGenre: {} } } as never });
    expect(VOICE_POOL_IDS).toContain(out.voiceId);
    expect(out.speed).toBeGreaterThanOrEqual(0.8);
    expect(out.speed).toBeLessThanOrEqual(1.1);
  });

  it("falls back to a default authoritative voice when the model keeps failing", async () => {
    vi.mocked(generateObject).mockRejectedValueOnce(makeNoObjectErr()).mockRejectedValueOnce(makeNoObjectErr());
    const out = await pickLongformVoice({ topic: "t", narrationSample: "x", playbook: { voice: { bestVoiceIdByGenre: {} } } as never });
    expect(VOICE_POOL_IDS).toContain(out.voiceId);
    expect(out.provider).toBe("cartesia");
  });
});
