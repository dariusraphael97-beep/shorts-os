import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/gateway", () => ({
  getClaudeModel: vi.fn(() => ({ __mock: "model" })),
}));

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

import { generateObject } from "ai";
import { runStrategist } from "@/lib/agents/strategist";

const fakeChannel = {
  id: "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5",
  slug: "default",
  display_name: "Default Channel",
  platform: "youtube" as const,
  external_channel_id: null,
  niche_id: null,
  persona: {
    niche: "history",
    voice: "dry deadpan",
    pov: "patterns repeat",
    style_guide: "open with a year",
    forbidden: [] as string[],
  },
  default_voice_id: "sonic-narrator-male-deadpan",
  default_tts_provider: "cartesia" as const,
  is_active: true,
  max_uploads_per_day: 2,
  target_format_mix: { explainer: 0.6, compilation: 0.4 },
  created_at: "2026-05-24T00:00:00Z",
  updated_at: "2026-05-24T00:00:00Z",
};

const fakeTopic = {
  id: "topic-uuid",
  niche_id: null,
  source: "reddit" as const,
  external_ref: null,
  title: "Vienna refused electricity in 1903",
  summary: "The city voted against electrification…",
  raw_payload: {},
  hookability_score: 87,
  scored_at: "2026-05-24T00:00:00Z",
  state: "reviewed" as const,
  created_at: "2026-05-24T00:00:00Z",
};

describe("runStrategist", () => {
  beforeEach(() => {
    vi.mocked(generateObject).mockReset();
  });

  it("returns the structured output from generateObject", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        dispatch_directive: "Lean into the 1903 detail and the civic mistrust angle.",
        format_hints: ["open with the year", "one surprising claim"],
        selected_channel_id: "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5",
        selected_format: "explainer",
        analyst_guidance_acknowledged: true,
        rationale: "Matches dry-deadpan history voice and the persona's style guide.",
      },
    } as any);

    const out = await runStrategist({
      job: { id: "j1" } as any,
      topic: fakeTopic as any,
      channel: fakeChannel as any,
      previousOutputs: {},
    });

    expect(out.dispatch_directive).toMatch(/1903/);
    expect(out.format_hints).toContain("open with the year");
    expect(out.selected_channel_id).toBe(fakeChannel.id);
    expect(out.selected_format).toBe("explainer");
    expect(out.analyst_guidance_acknowledged).toBe(true);
    expect(generateObject).toHaveBeenCalledOnce();
  });

  it("accepts compilation format with a forced_format_incompatible override", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        dispatch_directive: "Build a Top-5 around viral fail moments this week.",
        format_hints: ["fast cuts", "build to payoff"],
        selected_channel_id: "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5",
        selected_format: "compilation",
        analyst_guidance_acknowledged: true,
        forced_format_incompatible: {
          reason: "Topic is a single-claim explainer but clip_library is empty.",
        },
        rationale: "Empty clip library for the natural format forced compilation alternative.",
      },
    } as any);

    const out = await runStrategist({
      job: { id: "j1" } as any,
      topic: fakeTopic as any,
      channel: fakeChannel as any,
      previousOutputs: {},
    });
    expect(out.selected_format).toBe("compilation");
    expect(out.forced_format_incompatible?.reason).toMatch(/empty/i);
  });

  it("rejects output that fails schema validation", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        dispatch_directive: "x", // too short — min 20
        format_hints: [],         // too few — min 1
        selected_channel_id: "not-a-uuid",
        selected_format: "explainer",
        analyst_guidance_acknowledged: false,
        rationale: "y",           // too short — min 20
      },
    } as any);

    await expect(
      runStrategist({
        job: { id: "j1" } as any,
        topic: fakeTopic as any,
        channel: fakeChannel as any,
        previousOutputs: {},
      })
    ).rejects.toThrow();
  });

  it("rejects output missing selected_format", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        dispatch_directive: "Lean into the 1903 detail and the civic mistrust angle.",
        format_hints: ["open with the year"],
        selected_channel_id: "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5",
        analyst_guidance_acknowledged: true,
        rationale: "Matches dry-deadpan history voice and the persona's style guide.",
      },
    } as any);

    await expect(
      runStrategist({
        job: { id: "j1" } as any,
        topic: fakeTopic as any,
        channel: fakeChannel as any,
        previousOutputs: {},
      }),
    ).rejects.toThrow();
  });
});
