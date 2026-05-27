import { describe, it, expect, vi } from "vitest";
import {
  insertCompilationDraft,
  listProposedDrafts,
  listRenderedDrafts,
  getDraftById,
  updateDraftStatus,
  updateDraftClipRefs,
  setRenderedPath,
  setPromotedYourVideoId,
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

  it("listProposedDrafts orders by created_at desc and filters status='proposed'", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [{ id: "d1" }], error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const eqStatus = vi.fn().mockReturnValue({ order });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: eqStatus }),
      }),
    };
    const rows = await listProposedDrafts(supabase as never, { limit: 10 });
    expect(rows).toEqual([{ id: "d1" }]);
    expect(eqStatus).toHaveBeenCalledWith("status", "proposed");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(10);
  });

  it("listProposedDrafts narrows by channelId when supplied", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const eqChannel = vi.fn().mockReturnValue({ order });
    const eqStatus = vi.fn().mockReturnValue({ eq: eqChannel });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: eqStatus }),
      }),
    };
    await listProposedDrafts(supabase as never, { channelId: "ch7" });
    expect(eqChannel).toHaveBeenCalledWith("channel_id", "ch7");
  });

  it("listRenderedDrafts orders by updated_at desc, status='rendered'", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [{ id: "r1" }], error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const eqStatus = vi.fn().mockReturnValue({ order });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: eqStatus }),
      }),
    };
    const rows = await listRenderedDrafts(supabase as never, {});
    expect(rows).toEqual([{ id: "r1" }]);
    expect(eqStatus).toHaveBeenCalledWith("status", "rendered");
    expect(order).toHaveBeenCalledWith("updated_at", { ascending: false });
  });

  it("getDraftById returns the row or null", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "d9" }, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq }),
      }),
    };
    const row = await getDraftById(supabase as never, "d9");
    expect(row).toEqual({ id: "d9" });
    expect(eq).toHaveBeenCalledWith("id", "d9");
  });

  it("getDraftById returns null when not found", async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    };
    const row = await getDraftById(supabase as never, "missing");
    expect(row).toBeNull();
  });

  it("updateDraftStatus rejects illegal transitions before touching supabase", async () => {
    const fromFn = vi.fn();
    const supabase = { from: fromFn };
    await expect(
      updateDraftStatus(supabase as never, { id: "d1", from: "posted", to: "approved" }),
    ).rejects.toThrow(/illegal draft transition posted → approved/);
    expect(fromFn).not.toHaveBeenCalled();
  });

  it("updateDraftStatus succeeds on a legal transition", async () => {
    const eqStatus = vi.fn().mockResolvedValue({ count: 1, error: null });
    const eqId = vi.fn().mockReturnValue({ eq: eqStatus });
    const update = vi.fn().mockReturnValue({ eq: eqId });
    const supabase = { from: vi.fn().mockReturnValue({ update }) };
    await updateDraftStatus(supabase as never, { id: "d1", from: "proposed", to: "approved" });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "approved" }),
      { count: "exact" },
    );
    expect(eqId).toHaveBeenCalledWith("id", "d1");
    expect(eqStatus).toHaveBeenCalledWith("status", "proposed");
  });

  it("updateDraftStatus throws when no row matches the from-status guard", async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
          }),
        }),
      }),
    };
    await expect(
      updateDraftStatus(supabase as never, { id: "d1", from: "proposed", to: "approved" }),
    ).rejects.toThrow(/not in status proposed/);
  });

  it("updateDraftClipRefs only writes when draft is still proposed", async () => {
    const eqStatus = vi.fn().mockResolvedValue({ error: null });
    const eqId = vi.fn().mockReturnValue({ eq: eqStatus });
    const update = vi.fn().mockReturnValue({ eq: eqId });
    const supabase = { from: vi.fn().mockReturnValue({ update }) };
    await updateDraftClipRefs(supabase as never, {
      id: "d1",
      clip_refs: refs,
      music_track_id: "m2",
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ clip_refs: refs, music_track_id: "m2" }),
    );
    expect(eqStatus).toHaveBeenCalledWith("status", "proposed");
  });

  it("setRenderedPath flips status to rendered", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const supabase = { from: vi.fn().mockReturnValue({ update }) };
    await setRenderedPath(supabase as never, { id: "d1", rendered_path: "https://blob/x.mp4" });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ rendered_path: "https://blob/x.mp4", status: "rendered" }),
    );
  });

  it("setPromotedYourVideoId flips status to posted", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const supabase = { from: vi.fn().mockReturnValue({ update }) };
    await setPromotedYourVideoId(supabase as never, { id: "d1", your_video_id: "yv1" });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ promoted_your_video_id: "yv1", status: "posted" }),
    );
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
