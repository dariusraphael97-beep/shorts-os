import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/repositories/your-videos", () => ({ getYourVideoById: vi.fn() }));
vi.mock("@/lib/supabase/repositories/render-jobs", () => ({ enqueueRenderJob: vi.fn() }));

import { drainPipeline } from "@/lib/agents/auto-dispatch";
import { getYourVideoById } from "@/lib/supabase/repositories/your-videos";
import { enqueueRenderJob } from "@/lib/supabase/repositories/render-jobs";
import type { StreamEvent } from "@/lib/agents/types";

function fakePipeline(events: StreamEvent[]) {
  return async function* () { for (const e of events) yield e; };
}
function supabaseWithUpdate(count: number) {
  return { from: () => ({ update: () => ({ eq: () => ({ eq: async () => ({ error: null, count }) }) }) }) } as never;
}

describe("drainPipeline", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("enqueues render_f1 when the produced id is a your_videos draft", async () => {
    vi.mocked(getYourVideoById).mockResolvedValue({ id: "yv-1", status: "draft" } as never);
    await drainPipeline({
      topicId: "t1", sourceNicheClusterId: "c1", scriptBrief: {},
      supabase: supabaseWithUpdate(1),
      pipeline: fakePipeline([{ type: "job_completed", data: { videoId: "yv-1" } }]),
    });
    expect(enqueueRenderJob).toHaveBeenCalledWith(expect.anything(), {
      jobType: "render_f1", payload: { your_video_id: "yv-1" }, yourVideoId: "yv-1",
    });
  });

  it("skips render when the produced id is NOT a your_videos row (compilation)", async () => {
    vi.mocked(getYourVideoById).mockResolvedValue(null);
    await drainPipeline({
      topicId: "t1", sourceNicheClusterId: "c1", scriptBrief: {},
      supabase: {} as never,
      pipeline: fakePipeline([{ type: "job_completed", data: { videoId: "cd-1" } }]),
    });
    expect(enqueueRenderJob).not.toHaveBeenCalled();
  });

  it("does not enqueue on job_failed", async () => {
    await drainPipeline({
      topicId: "t1", sourceNicheClusterId: "c1", scriptBrief: {},
      supabase: {} as never,
      pipeline: fakePipeline([{ type: "job_failed", data: { agent: "writer", error: "x" } }]),
    });
    expect(enqueueRenderJob).not.toHaveBeenCalled();
  });

  it("swallows a pipeline throw (never rethrows)", async () => {
    const throwing = async function* (): AsyncGenerator<StreamEvent> { throw new Error("boom"); };
    await expect(drainPipeline({
      topicId: "t1", sourceNicheClusterId: "c1", scriptBrief: {},
      supabase: {} as never, pipeline: throwing,
    })).resolves.toBeUndefined();
    expect(enqueueRenderJob).not.toHaveBeenCalled();
  });
});
