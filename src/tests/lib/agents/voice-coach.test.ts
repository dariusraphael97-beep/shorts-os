import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/gateway", () => ({
  getClaudeModel: vi.fn(() => ({ __mock: "model" })),
}));

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

import { generateObject } from "ai";
import { runVoiceCoach } from "@/lib/agents/voice-coach";
import { VOICE_POOL_IDS } from "@/lib/agents/constants";

const fakeContext = () => ({
  job: { id: "j1" } as any,
  topic: { title: "X", summary: "y" } as any,
  channel: {
    id: "ch1",
    persona: { voice: "dry deadpan" },
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
});
