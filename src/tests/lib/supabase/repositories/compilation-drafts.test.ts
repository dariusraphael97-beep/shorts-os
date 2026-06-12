import { describe, it, expect, vi } from "vitest";
import {
  insertCompilationDraft,
  listRecentPatterns,
  type ClipRef,
} from "@/lib/supabase/repositories/compilation-drafts";

const refs: ClipRef[] = [
  { clip_id: "c1", start_sec: 0, end_sec: 5, label: "one", order: 1 },
];

describe("compilation-drafts repo", () => {
  it("insertCompilationDraft returns the new row id and forces status='proposed'", async () => {
    const insert = vi.fn().mockReturnThis();
    const select = vi.fn().mockReturnThis();
    const single = vi.fn().mockResolvedValue({ data: { id: "d1" }, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({ insert, select, single }),
    };
    const id = await insertCompilationDraft(supabase as never, {
      channel_id: "ch1",
      topic_queue_id: "t1",
      theme: "theme",
      title_template: "TOP 5 X",
      accent_word: "X",
      title_formula_id: "top_5",
      reveal_pattern: "dramatic",
      caption_style: "mixed",
      layout_variant: "top5_sidebar",
      clip_refs: refs,
      music_track_id: "m1",
    });
    expect(id).toBe("d1");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ status: "proposed" }));
  });

  it("insertCompilationDraft throws on supabase error", async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }),
      }),
    };
    await expect(
      insertCompilationDraft(supabase as never, {
        channel_id: "ch1",
        topic_queue_id: null,
        theme: "t",
        title_template: "title",
        accent_word: "a",
        title_formula_id: "top_5",
        reveal_pattern: "dramatic",
        caption_style: "mixed",
        layout_variant: "top5_sidebar",
        clip_refs: refs,
        music_track_id: null,
      }),
    ).rejects.toThrow(/insertCompilationDraft: boom/);
  });

  it("listRecentPatterns selects last 5 posted/rendered for a channel", async () => {
    const limit = vi
      .fn()
      .mockResolvedValue({ data: [{ title_formula_id: "top_5" }], error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const inStatus = vi.fn().mockReturnValue({ order });
    const eqChannel = vi.fn().mockReturnValue({ in: inStatus });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: eqChannel }),
      }),
    };
    const rows = await listRecentPatterns(supabase as never, { channelId: "ch1" });
    expect(rows).toEqual([{ title_formula_id: "top_5" }]);
    expect(eqChannel).toHaveBeenCalledWith("channel_id", "ch1");
    expect(inStatus).toHaveBeenCalledWith("status", ["posted", "rendered"]);
    expect(limit).toHaveBeenCalledWith(5);
  });
});
