import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ getServiceClient: () => ({}) }));
vi.mock("@/lib/supabase/repositories/compilation-drafts", () => ({
  getDraftById: vi.fn(),
  updateDraftStatus: vi.fn(),
}));
vi.mock("@/lib/supabase/repositories/render-jobs", () => ({
  enqueueRenderJob: vi.fn(),
}));

import { POST } from "@/app/api/clips/candidates/[id]/approve/route";
import {
  getDraftById,
  updateDraftStatus,
} from "@/lib/supabase/repositories/compilation-drafts";
import { enqueueRenderJob } from "@/lib/supabase/repositories/render-jobs";

const DRAFT_ID = "11111111-1111-4111-8111-111111111111";

function ctx() {
  return { params: Promise.resolve({ id: DRAFT_ID }) };
}

describe("POST /api/clips/candidates/[id]/approve", () => {
  beforeEach(() => {
    vi.mocked(getDraftById).mockReset();
    vi.mocked(updateDraftStatus).mockReset();
    vi.mocked(enqueueRenderJob).mockReset();
  });

  it("404s when draft is missing", async () => {
    vi.mocked(getDraftById).mockResolvedValue(null);
    const res = await POST(new Request("http://t/"), ctx());
    expect(res.status).toBe(404);
    expect(updateDraftStatus).not.toHaveBeenCalled();
    expect(enqueueRenderJob).not.toHaveBeenCalled();
  });

  it("409s when draft is not in proposed status", async () => {
    vi.mocked(getDraftById).mockResolvedValue({ id: DRAFT_ID, status: "approved" } as never);
    const res = await POST(new Request("http://t/"), ctx());
    expect(res.status).toBe(409);
    expect(updateDraftStatus).not.toHaveBeenCalled();
    expect(enqueueRenderJob).not.toHaveBeenCalled();
  });

  it("transitions and enqueues render_f2 on happy path", async () => {
    vi.mocked(getDraftById).mockResolvedValue({ id: DRAFT_ID, status: "proposed" } as never);
    vi.mocked(updateDraftStatus).mockResolvedValue(undefined);
    vi.mocked(enqueueRenderJob).mockResolvedValue({ id: "job-1" } as never);

    const res = await POST(new Request("http://t/"), ctx());
    expect(res.status).toBe(200);
    expect(updateDraftStatus).toHaveBeenCalledWith(expect.anything(), {
      id: DRAFT_ID,
      from: "proposed",
      to: "approved",
    });
    expect(enqueueRenderJob).toHaveBeenCalledWith(expect.anything(), {
      jobType: "render_f2",
      payload: { compilation_draft_id: DRAFT_ID },
      compilationDraftId: DRAFT_ID,
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.job_id).toBe("job-1");
  });
});
