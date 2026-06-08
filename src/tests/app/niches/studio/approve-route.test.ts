// src/tests/app/niches/studio/approve-route.test.ts
import { describe, it, expect, vi } from "vitest";
import { approveDraftForRender } from "@/app/api/niches/studio/[draftId]/approve/route";

function supa(existingJob: unknown) {
  const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: "job-new", status: "pending" }, error: null }) }) });
  const updateEq = vi.fn().mockResolvedValue({ data: null, error: null });
  const update = vi.fn().mockReturnValue({ eq: updateEq });
  // latest render job lookup
  const maybeSingle = vi.fn().mockResolvedValue({ data: existingJob, error: null });
  const order = vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ maybeSingle }) });
  const eqSel = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq: eqSel });
  const from = vi.fn().mockReturnValue({ insert, update, select });
  return { client: { from } as never, insert, update };
}

describe("approveDraftForRender", () => {
  it("enqueues a render job + sets status rendering when none exists", async () => {
    const { client, insert, update } = supa(null);
    const res = await approveDraftForRender(client, "draft-1");
    expect(res.enqueued).toBe(true);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ job_type: "render_longform", payload: { your_video_id: "draft-1" }, your_video_id: "draft-1" }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "rendering" }));
  });

  it("is idempotent — does NOT enqueue a second job if one is already active", async () => {
    const { client, insert } = supa({ id: "job-old", status: "pending" });
    const res = await approveDraftForRender(client, "draft-1");
    expect(res.enqueued).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });
});
