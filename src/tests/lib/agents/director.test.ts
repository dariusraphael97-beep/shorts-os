import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/gateway", () => ({
  getClaudeModel: vi.fn(() => ({ __mock: "model" })),
}));

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

import { generateObject } from "ai";
import { runDirector } from "@/lib/agents/director";
import { VISUAL_TREATMENTS, VOICE_POOL_IDS } from "@/lib/agents/constants";

const fakeContext = () => ({
  job: { id: "j1" } as any,
  topic: { title: "X", summary: "y" } as any,
  channel: { persona: { niche: "history" } } as any,
  previousOutputs: {
    strategist: {
      dispatch_directive: "x".repeat(40),
      format_hints: ["a"],
      selected_channel_id: "c1",
      rationale: "x".repeat(40),
    },
    writer: {
      script: "In 1903, the citizens of Vienna refused electric lights. " + "x ".repeat(200),
      hook_first_3_seconds: "In 1903…",
      word_count: 220,
      estimated_duration_seconds: 88,
    },
    voiceCoach: {
      voice_id: VOICE_POOL_IDS[0],
      provider: "cartesia" as const,
      speed: 1.0,
      stability: 0.6,
      rationale: "x".repeat(40),
    },
  },
});

describe("runDirector", () => {
  beforeEach(() => {
    vi.mocked(generateObject).mockReset();
  });

  it("returns a valid treatment + shot list", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        visual_treatment: VISUAL_TREATMENTS[0],
        music_mood: "low-key tension",
        shot_list: [
          { segment_text: "In 1903, Vienna…", broll_search_query: "vienna 1903 archive", duration_seconds: 4 },
          { segment_text: "The vote was…", broll_search_query: "election vote close-up", duration_seconds: 5 },
          { segment_text: "Citizens worried…", broll_search_query: "old newspaper headline", duration_seconds: 4 },
          { segment_text: "Today we…", broll_search_query: "modern city night skyline", duration_seconds: 5 },
        ],
        caption_props: {
          variant: "word-by-word",
          accent_color: "#FFD23F",
          accent_word_policy: "first-noun",
          highlighted_words: [],
          animation_speed: 1.0,
          font_scale: 1.0,
        },
        rationale: "Treatment matches the archive-collage feel of the script.",
      },
    } as any);

    const out = await runDirector(fakeContext() as any);
    expect(out.visual_treatment).toBe(VISUAL_TREATMENTS[0]);
    expect(out.shot_list).toHaveLength(4);
    expect(out.music_mood).toBe("low-key tension");
  });

  it("throws on out-of-enum treatment", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        visual_treatment: "live-action-deepfake",
        music_mood: "x",
        shot_list: [
          { segment_text: "a", broll_search_query: "x", duration_seconds: 4 },
          { segment_text: "b", broll_search_query: "x", duration_seconds: 4 },
          { segment_text: "c", broll_search_query: "x", duration_seconds: 4 },
          { segment_text: "d", broll_search_query: "x", duration_seconds: 4 },
        ],
        caption_props: {
          variant: "word-by-word",
          accent_color: "#FFD23F",
          accent_word_policy: "first-noun",
          highlighted_words: [],
          animation_speed: 1.0,
          font_scale: 1.0,
        },
        rationale: "x x x x x x x x x x x x x x x x x x x x",
      },
    } as any);

    await expect(runDirector(fakeContext() as any)).rejects.toThrow();
  });

  it("throws on shot_list with fewer than 4 entries", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        visual_treatment: VISUAL_TREATMENTS[0],
        music_mood: "x",
        shot_list: [
          { segment_text: "a", broll_search_query: "x", duration_seconds: 4 },
        ],
        caption_props: {
          variant: "word-by-word",
          accent_color: "#FFD23F",
          accent_word_policy: "first-noun",
          highlighted_words: [],
          animation_speed: 1.0,
          font_scale: 1.0,
        },
        rationale: "x x x x x x x x x x x x x x x x x x x x",
      },
    } as any);

    await expect(runDirector(fakeContext() as any)).rejects.toThrow();
  });
});
