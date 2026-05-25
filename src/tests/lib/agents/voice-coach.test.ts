import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/gateway", () => ({
  getClaudeModel: vi.fn(() => ({ __mock: "model" })),
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    generateObject: vi.fn(),
  };
});

import { generateObject, NoObjectGeneratedError } from "ai";
import { runVoiceCoach } from "@/lib/agents/voice-coach";
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

const fakeContext = (overrides: { channel?: Partial<{ default_voice_id: string | null; default_tts_provider: "cartesia" | "elevenlabs" | null }> } = {}) => ({
  job: { id: "j1" } as any,
  topic: { title: "X", summary: "y" } as any,
  channel: {
    id: "ch1",
    persona: { voice: "dry deadpan" },
    default_voice_id: "sonic-narrator-male-deadpan",
    default_tts_provider: "cartesia",
    ...overrides.channel,
  } as any,
  previousOutputs: {
    strategist: {
      dispatch_directive: "x".repeat(40),
      format_hints: ["a"],
      selected_channel_id: "ch1",
      rationale: "x".repeat(40),
    },
    writer: {
      script: "In 1903, the citizens of Vienna refused electric lights. " + "x ".repeat(200),
      hook_first_3_seconds: "In 1903, the citizens of Vienna refused electric lights.",
      word_count: 220,
      estimated_duration_seconds: 88,
    },
  },
});

describe("runVoiceCoach", () => {
  beforeEach(() => {
    vi.mocked(generateObject).mockReset();
  });

  it("returns a valid pick from the voice pool", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        voice_id: VOICE_POOL_IDS[0],
        provider: "cartesia",
        speed: 1.0,
        stability: 0.6,
        rationale: "Best fit for the channel's dry deadpan voice.",
      },
    } as any);

    const out = await runVoiceCoach(fakeContext() as any);
    expect(out.voice_id).toBe(VOICE_POOL_IDS[0]);
    expect(out.provider).toBe("cartesia");
    expect(out.speed).toBe(1.0);
  });

  it("throws on out-of-pool voice_id", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        voice_id: "not-in-pool",
        provider: "cartesia",
        speed: 1.0,
        stability: 0.6,
        rationale: "x x x x x x x x x x x x x x x x x x x x",
      },
    } as any);

    await expect(runVoiceCoach(fakeContext() as any)).rejects.toThrow();
  });

  it("throws on out-of-range speed", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        voice_id: VOICE_POOL_IDS[0],
        provider: "cartesia",
        speed: 2.0,
        stability: 0.6,
        rationale: "x x x x x x x x x x x x x x x x x x x x",
      },
    } as any);

    await expect(runVoiceCoach(fakeContext() as any)).rejects.toThrow();
  });

  it("retries once on NoObjectGeneratedError and returns the second attempt", async () => {
    vi.mocked(generateObject)
      .mockRejectedValueOnce(makeNoObjectErr())
      .mockResolvedValueOnce({
        object: {
          voice_id: VOICE_POOL_IDS[0],
          provider: "cartesia",
          speed: 1.0,
          stability: 0.6,
          rationale: "Second attempt succeeded with a clean schema match for this script.",
        },
      } as any);

    const out = await runVoiceCoach(fakeContext() as any);
    expect(out.voice_id).toBe(VOICE_POOL_IDS[0]);
    expect(out.fallback).toBeFalsy();
    expect(vi.mocked(generateObject)).toHaveBeenCalledTimes(2);
  });

  it("falls back to channel default voice when both attempts fail", async () => {
    vi.mocked(generateObject)
      .mockRejectedValueOnce(makeNoObjectErr())
      .mockRejectedValueOnce(makeNoObjectErr());

    const out = await runVoiceCoach(fakeContext() as any);
    expect(out.voice_id).toBe("sonic-narrator-male-deadpan");
    expect(out.provider).toBe("cartesia");
    expect(out.speed).toBe(1.0);
    expect(out.stability).toBe(0.75);
    expect(out.fallback).toBe(true);
    expect(out.rationale).toMatch(/fallback/i);
    expect(vi.mocked(generateObject)).toHaveBeenCalledTimes(2);
  });

  it("throws when both attempts fail AND channel has no default_voice_id", async () => {
    vi.mocked(generateObject)
      .mockRejectedValueOnce(makeNoObjectErr())
      .mockRejectedValueOnce(makeNoObjectErr());

    await expect(
      runVoiceCoach(fakeContext({ channel: { default_voice_id: null, default_tts_provider: null } }) as any),
    ).rejects.toThrow();
  });

  it("does not retry on non-NoObjectGeneratedError failures", async () => {
    vi.mocked(generateObject).mockRejectedValueOnce(new Error("network down"));

    await expect(runVoiceCoach(fakeContext() as any)).rejects.toThrow(/network down/);
    expect(vi.mocked(generateObject)).toHaveBeenCalledTimes(1);
  });
});
