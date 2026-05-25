import { describe, it, expect, vi } from "vitest";
import { listQueuedTopics, updateTopicState } from "@/lib/supabase/repositories/topic-queue";

function mockSupabaseChain(returnValue: unknown) {
  // Each call returns `this` until terminating with the await.
  // We make `.then` exist so the chain is await-able and resolves to returnValue.
  const obj: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) => resolve(returnValue),
  };
  return obj;
}

describe("topic-queue repository", () => {
  it("listQueuedTopics queries the right shape", async () => {
    const supa = mockSupabaseChain({ data: [{ id: "x", title: "Y" }], error: null });
    const rows = await listQueuedTopics(supa as any, 30);
    expect(supa.from).toHaveBeenCalledWith("topic_queue");
    expect(supa.eq).toHaveBeenCalledWith("state", "queued");
    expect(supa.not).toHaveBeenCalledWith("hookability_score", "is", null);
    expect(supa.order).toHaveBeenCalledWith("hookability_score", { ascending: false, nullsFirst: false });
    expect(supa.limit).toHaveBeenCalledWith(30);
    expect(rows).toEqual([{ id: "x", title: "Y" }]);
  });

  it("listQueuedTopics returns empty array if data is null", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    const rows = await listQueuedTopics(supa as any, 10);
    expect(rows).toEqual([]);
  });

  it("listQueuedTopics throws on supabase error", async () => {
    const supa = mockSupabaseChain({ data: null, error: { message: "boom" } });
    await expect(listQueuedTopics(supa as any, 10)).rejects.toThrow(/boom/);
  });

  it("updateTopicState writes the new state", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    await updateTopicState(supa as any, "abc-123", "reviewed");
    expect(supa.from).toHaveBeenCalledWith("topic_queue");
    expect(supa.update).toHaveBeenCalledWith({ state: "reviewed", rejected_reason: null });
    expect(supa.eq).toHaveBeenCalledWith("id", "abc-123");
  });

  it("updateTopicState records rejected_reason when provided", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    await updateTopicState(supa as any, "abc-123", "rejected", "off-topic");
    expect(supa.update).toHaveBeenCalledWith({ state: "rejected", rejected_reason: "off-topic" });
  });
});
