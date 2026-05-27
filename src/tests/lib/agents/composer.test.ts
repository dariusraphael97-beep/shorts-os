import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/gateway", () => ({
  getClaudeModel: vi.fn(() => ({ __mock: "model" })),
}));

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

vi.mock("@/lib/supabase/repositories/compilation-drafts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/supabase/repositories/compilation-drafts")>();
  return {
    ...actual,
    listRecentPatterns: vi.fn().mockResolvedValue([]),
    insertCompilationDraft: vi.fn().mockResolvedValue("draft-id-1"),
  };
});

import { generateObject } from "ai";
import {
  listRecentPatterns,
  insertCompilationDraft,
  type RecentPattern,
} from "@/lib/supabase/repositories/compilation-drafts";
import { runComposer, ComposerOutputSchema } from "@/lib/agents/composer";

const UUID = (n: number) =>
  `00000000-0000-4000-8000-00000000000${n.toString().padStart(1, "0")}`;
const C = [1, 2, 3, 4, 5].map((n) => UUID(n));
const MUSIC_ID = "11111111-1111-4111-8111-111111111111";

function makeValidOutput(overrides: Record<string, unknown> = {}) {
  return {
    title_template: "TOP 5 STREET FAILS",
    accent_word: "FAILS",
    title_formula_id: "top_5",
    reveal_pattern: "dramatic",
    caption_style: "mixed",
    layout_variant: "top5_sidebar",
    clip_refs: C.map((id, i) => ({
      clip_id: id,
      start_sec: 0,
      end_sec: 6,
      label: `clip ${i + 1}`,
      order: i + 1,
    })),
    music_track_id: MUSIC_ID,
    rationale: "strong dramatic arc, music supports the pacing",
    ...overrides,
  };
}

function buildSupabase(args: {
  candidates: Array<{ id: string; duration_seconds: number; description?: string | null; tags?: string[] }>;
  music: Array<{ id: string; title?: string; genre?: string | null; energy_level?: number | null }>;
  recentUsedDrafts?: Array<{ clip_refs: Array<{ clip_id: string }> }>;
}) {
  function chain(responses: { final: unknown }) {
    const c: Record<string, unknown> = {};
    const final = Promise.resolve({ data: responses.final, error: null });
    const passthrough = ["select", "eq", "neq", "gte", "lte", "in", "overlaps", "order"];
    for (const m of passthrough) {
      (c as Record<string, ReturnType<typeof vi.fn>>)[m] = vi.fn().mockReturnValue(c);
    }
    c.limit = vi.fn().mockReturnValue(final);
    c.maybeSingle = vi.fn().mockReturnValue(final);
    c.single = vi.fn().mockReturnValue(final);
    c.then = (onFulfilled: (v: unknown) => unknown) => final.then(onFulfilled);
    return c;
  }
  const from = vi.fn((table: string) => {
    switch (table) {
      case "clip_library":
        return chain({
          final: args.candidates.map((c) => ({
            id: c.id,
            description: c.description ?? "test description",
            tags: c.tags ?? ["x"],
            duration_seconds: c.duration_seconds,
          })),
        });
      case "music_tracks":
        return chain({
          final: args.music.map((m) => ({
            id: m.id,
            title: m.title ?? "Test Track",
            genre: m.genre ?? "ambient",
            energy_level: m.energy_level ?? 2,
          })),
        });
      case "compilation_drafts":
        return chain({ final: args.recentUsedDrafts ?? [] });
      default:
        return chain({ final: null });
    }
  });
  return { from } as never;
}

const baseCtx = {
  job: { id: "j1" },
  topic: { id: "t1", title: "Worst street fails this week" },
  channel: { id: "ch1", niche_id: "n1" },
  strategist: {
    selected_format: "compilation",
    dispatch_directive: "Lean into chaos, build to a payoff.",
    format_hints: ["cars", "fail"],
  },
};

describe("ComposerOutputSchema", () => {
  it("validates a well-formed object", () => {
    expect(ComposerOutputSchema.safeParse(makeValidOutput()).success).toBe(true);
  });
  it("rejects when clip_refs.length !== 5", () => {
    const bad = makeValidOutput({ clip_refs: [{ clip_id: C[0], start_sec: 0, end_sec: 6, label: "x", order: 1 }] });
    expect(ComposerOutputSchema.safeParse(bad).success).toBe(false);
  });
});

describe("runComposer", () => {
  beforeEach(() => {
    vi.mocked(generateObject).mockReset();
    vi.mocked(listRecentPatterns).mockReset();
    vi.mocked(insertCompilationDraft).mockReset();
    vi.mocked(listRecentPatterns).mockResolvedValue([]);
    vi.mocked(insertCompilationDraft).mockResolvedValue("draft-id-1");
  });

  it("happy path: valid LLM output → draft inserted → fallbackUsed=false", async () => {
    vi.mocked(generateObject).mockResolvedValue({ object: makeValidOutput() } as never);
    const supabase = buildSupabase({
      candidates: C.map((id) => ({ id, duration_seconds: 10 })),
      music: [{ id: MUSIC_ID }],
    });
    const out = await runComposer({ ...baseCtx, supabase } as never);
    expect(out.draftId).toBe("draft-id-1");
    expect(out.fallbackUsed).toBe(false);
    expect(out.output.music_track_id).toBe(MUSIC_ID);
    expect(generateObject).toHaveBeenCalledTimes(1);
    expect(insertCompilationDraft).toHaveBeenCalledOnce();
  });

  it("retries once when LLM output fails post-LLM validation (sum out of range)", async () => {
    const shortRefs = C.map((id, i) => ({
      clip_id: id,
      start_sec: 0,
      end_sec: 4,
      label: `c ${i + 1}`,
      order: i + 1,
    })); // sum=20s → out of [25,35]
    vi.mocked(generateObject)
      .mockResolvedValueOnce({ object: makeValidOutput({ clip_refs: shortRefs }) } as never)
      .mockResolvedValueOnce({ object: makeValidOutput() } as never);
    const supabase = buildSupabase({
      candidates: C.map((id) => ({ id, duration_seconds: 10 })),
      music: [{ id: MUSIC_ID }],
    });
    const out = await runComposer({ ...baseCtx, supabase } as never);
    expect(out.fallbackUsed).toBe(false);
    expect(generateObject).toHaveBeenCalledTimes(2);
  });

  it("falls back to heuristic when both LLM attempts fail post-LLM validation", async () => {
    const bogusMusicId = "99999999-9999-4999-8999-999999999999";
    vi.mocked(generateObject)
      .mockResolvedValueOnce({
        object: makeValidOutput({ music_track_id: bogusMusicId }),
      } as never)
      .mockResolvedValueOnce({
        object: makeValidOutput({ music_track_id: bogusMusicId }),
      } as never);
    const supabase = buildSupabase({
      candidates: C.map((id) => ({ id, duration_seconds: 8 })),
      music: [{ id: MUSIC_ID, title: "Ambient" }],
    });
    const out = await runComposer({ ...baseCtx, supabase } as never);
    expect(out.fallbackUsed).toBe(true);
    expect(generateObject).toHaveBeenCalledTimes(2);
    expect(out.output.music_track_id).toBe(MUSIC_ID);
    expect(out.output.clip_refs).toHaveLength(5);
  });

  it("throws when candidate pool has fewer than 5 clips", async () => {
    const supabase = buildSupabase({
      candidates: C.slice(0, 3).map((id) => ({ id, duration_seconds: 10 })),
      music: [{ id: MUSIC_ID }],
    });
    await expect(runComposer({ ...baseCtx, supabase } as never)).rejects.toThrow(
      /not enough candidates/,
    );
  });

  it("throws when no music tracks are available", async () => {
    const supabase = buildSupabase({
      candidates: C.map((id) => ({ id, duration_seconds: 10 })),
      music: [],
    });
    await expect(runComposer({ ...baseCtx, supabase } as never)).rejects.toThrow(
      /no music tracks/,
    );
  });

  it("rejects an LLM output that shares 3 of 4 pattern axes with a recent pattern", async () => {
    const recent: RecentPattern = {
      title_formula_id: "top_5",
      reveal_pattern: "dramatic",
      caption_style: "mixed",
      music_track_id: "different-music-id",
    };
    vi.mocked(listRecentPatterns).mockResolvedValue([recent]);
    // first call: same 3 of 4 axes (formula+reveal+caption match, music differs)
    vi.mocked(generateObject)
      .mockResolvedValueOnce({ object: makeValidOutput() } as never)
      .mockResolvedValueOnce({
        object: makeValidOutput({ reveal_pattern: "reverse_rank", caption_style: "descriptive" }),
      } as never);
    const supabase = buildSupabase({
      candidates: C.map((id) => ({ id, duration_seconds: 10 })),
      music: [{ id: MUSIC_ID }],
    });
    const out = await runComposer({ ...baseCtx, supabase } as never);
    expect(generateObject).toHaveBeenCalledTimes(2);
    expect(out.fallbackUsed).toBe(false);
  });
});
