import { describe, it, expect, vi } from "vitest";
import {
  createProduceVideoJob,
  getActiveProduceVideoJob,
  updateJobProgress,
  finishJobSuccess,
  finishJobFailure,
} from "@/lib/supabase/repositories/jobs";

function mockSupabaseChain(returnValue: unknown) {
  const obj: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) => resolve(returnValue),
  };
  return obj;
}

describe("jobs repository", () => {
  it("createProduceVideoJob inserts with correct kind + status", async () => {
    const row = { id: "job-uuid", kind: "produce_video", status: "running" };
    const supa = mockSupabaseChain({ data: row, error: null });
    const result = await createProduceVideoJob(supa as any, { topicId: "t1", channelId: "c1" });
    expect(supa.from).toHaveBeenCalledWith("jobs");
    expect(supa.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "produce_video",
        status: "running",
        topic_queue_id: "t1",
        channel_id: "c1",
        current_step: "strategist",
        current_agent: "strategist",
        progress_pct: 0,
      })
    );
    expect(result).toEqual(row);
  });

  it("getActiveProduceVideoJob queries kind + status filter", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    await getActiveProduceVideoJob(supa as any);
    expect(supa.from).toHaveBeenCalledWith("jobs");
    expect(supa.eq).toHaveBeenCalledWith("kind", "produce_video");
    expect(supa.in).toHaveBeenCalledWith("status", ["queued", "running"]);
    expect(supa.maybeSingle).toHaveBeenCalled();
  });

  it("updateJobProgress updates current_agent + progress_pct", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    await updateJobProgress(supa as any, "job-1", { currentAgent: "writer", progressPct: 25 });
    expect(supa.update).toHaveBeenCalledWith({
      current_agent: "writer",
      current_step: "writer",
      progress_pct: 25,
    });
    expect(supa.eq).toHaveBeenCalledWith("id", "job-1");
  });

  it("finishJobSuccess sets succeeded + 100 pct + finished_at", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    await finishJobSuccess(supa as any, "job-1");
    const updateCall = supa.update.mock.calls[0][0];
    expect(updateCall.status).toBe("succeeded");
    expect(updateCall.progress_pct).toBe(100);
    expect(typeof updateCall.finished_at).toBe("string");
  });

  it("finishJobFailure sets failed + error message + finished_at", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    await finishJobFailure(supa as any, "job-1", "writer exploded");
    const updateCall = supa.update.mock.calls[0][0];
    expect(updateCall.status).toBe("failed");
    expect(updateCall.error).toBe("writer exploded");
    expect(typeof updateCall.finished_at).toBe("string");
  });

  it("createProduceVideoJob throws on supabase error", async () => {
    const supa = mockSupabaseChain({ data: null, error: { message: "boom" } });
    await expect(
      createProduceVideoJob(supa as any, { topicId: "t1", channelId: "c1" })
    ).rejects.toThrow(/boom/);
  });
});
