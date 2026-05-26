import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  getServiceClient: vi.fn(),
}));
vi.mock("@/lib/supabase/repositories/render-jobs", () => ({
  enqueueRenderJob: vi.fn(),
}));

import { POST } from "@/app/api/lab/render/route";
import { getServiceClient } from "@/lib/supabase/server";
import { enqueueRenderJob } from "@/lib/supabase/repositories/render-jobs";

function reqWithBody(body: unknown): Request {
  return new Request("http://x/api/lab/render", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/lab/render", () => {
  it("400s on missing draftId", async () => {
    const res = await POST(reqWithBody({}));
    expect(res.status).toBe(400);
  });

  it("404s on unknown draft", async () => {
    vi.mocked(getServiceClient).mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: { code: "PGRST116" } }) }) }) }),
    } as never);
    const res = await POST(reqWithBody({ draftId: "11111111-1111-1111-1111-111111111111" }));
    expect(res.status).toBe(404);
  });

  it("409s when draft is not in 'draft' status", async () => {
    vi.mocked(getServiceClient).mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { id: "v1", status: "rendered" }, error: null }) }) }) }),
    } as never);
    const res = await POST(reqWithBody({ draftId: "11111111-1111-1111-1111-111111111111" }));
    expect(res.status).toBe(409);
  });

  it("happy path: flips status to rendering, enqueues job, returns 200", async () => {
    const update = vi.fn(() => ({ eq: () => ({ eq: async () => ({ error: null, count: 1 }) }) }));
    vi.mocked(getServiceClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "your_videos") {
          return {
            select: () => ({ eq: () => ({ single: async () => ({ data: { id: "v1", status: "draft" }, error: null }) }) }),
            update,
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    } as never);
    vi.mocked(enqueueRenderJob).mockResolvedValue({ id: "job-uuid" } as never);

    const res = await POST(reqWithBody({ draftId: "11111111-1111-1111-1111-111111111111" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobId).toBe("job-uuid");
    expect(enqueueRenderJob).toHaveBeenCalledWith(expect.anything(), {
      jobType: "render_f1",
      payload: { your_video_id: "v1" },
      yourVideoId: "v1",
    });
  });
});
