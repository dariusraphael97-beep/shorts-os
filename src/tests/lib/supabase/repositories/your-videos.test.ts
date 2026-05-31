import { describe, it, expect, vi } from "vitest";
import {
  createVideoDraft,
  listRecentDrafts,
  discardDraft,
} from "@/lib/supabase/repositories/your-videos";

function mockSupabaseChain(returnValue: unknown) {
  const obj: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) => resolve(returnValue),
  };
  return obj;
}

describe("your-videos repository", () => {
  it("createVideoDraft inserts and returns the row", async () => {
    const row = { id: "v1", status: "draft", title: "X" };
    const supa = mockSupabaseChain({ data: row, error: null });
    const result = await createVideoDraft(supa as any, {
      channelId: "c1",
      topicQueueId: "t1",
      title: "X",
      script: "Hello world",
      voiceProvider: "cartesia",
      voiceId: "sonic-narrator-male-deadpan",
      visualTreatment: "stock-montage",
      durationSeconds: 45,
      captionProps: {
        variant: "word-by-word",
        accent_color: "#FFD23F",
        accent_word_policy: "first-noun",
        highlighted_words: [],
        animation_speed: 1.0,
        font_scale: 1.0,
      },
    });
    expect(supa.from).toHaveBeenCalledWith("your_videos");
    expect(supa.insert).toHaveBeenCalledWith({
      channel_id: "c1",
      topic_queue_id: "t1",
      title: "X",
      script: "Hello world",
      voice_provider: "cartesia",
      voice_id: "sonic-narrator-male-deadpan",
      visual_treatment: "stock-montage",
      duration_seconds: 45,
      caption_props: {
        variant: "word-by-word",
        accent_color: "#FFD23F",
        accent_word_policy: "first-noun",
        highlighted_words: [],
        animation_speed: 1.0,
        font_scale: 1.0,
      },
      source_niche_cluster_id: null,
      script_brief: null,
      status: "draft",
    });
    expect(result).toEqual(row);
  });

  it("listRecentDrafts queries draft status + orders by created_at desc", async () => {
    const supa = mockSupabaseChain({ data: [{ id: "x" }], error: null });
    const rows = await listRecentDrafts(supa as any, 5);
    expect(supa.from).toHaveBeenCalledWith("your_videos");
    expect(supa.eq).toHaveBeenCalledWith("status", "draft");
    expect(supa.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(supa.limit).toHaveBeenCalledWith(5);
    expect(rows).toEqual([{ id: "x" }]);
  });

  it("listRecentDrafts returns empty array if data is null", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    const rows = await listRecentDrafts(supa as any, 5);
    expect(rows).toEqual([]);
  });

  it("discardDraft sets status='failed'", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    await discardDraft(supa as any, "v1");
    expect(supa.update).toHaveBeenCalledWith({ status: "failed" });
    expect(supa.eq).toHaveBeenCalledWith("id", "v1");
  });

  it("createVideoDraft throws on error", async () => {
    const supa = mockSupabaseChain({ data: null, error: { message: "boom" } });
    await expect(
      createVideoDraft(supa as any, {
        channelId: "c1",
        topicQueueId: "t1",
        title: "X",
        script: "y",
        voiceProvider: "cartesia",
        voiceId: "v",
        visualTreatment: "stock-montage",
        durationSeconds: 1,
        captionProps: {
          variant: "word-by-word",
          accent_color: "#FFD23F",
          accent_word_policy: "first-noun",
          highlighted_words: [],
          animation_speed: 1.0,
          font_scale: 1.0,
        },
      })
    ).rejects.toThrow(/boom/);
  });
});
