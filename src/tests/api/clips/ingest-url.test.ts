import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/repositories/render-jobs", () => ({ enqueueRenderJob: vi.fn() }));
vi.mock("@/lib/supabase/repositories/channels", () => ({ getDefaultChannel: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  getServiceClient: () => ({}),
}));
vi.mock("@/lib/supabase/repositories/clip-library", () => ({
  isSourceUrlIngested: vi.fn(),
}));

import { POST } from "@/app/api/clips/ingest-url/route";
import { enqueueRenderJob } from "@/lib/supabase/repositories/render-jobs";
import { getDefaultChannel } from "@/lib/supabase/repositories/channels";
import { isSourceUrlIngested } from "@/lib/supabase/repositories/clip-library";

describe("POST /api/clips/ingest-url", () => {
  beforeEach(() => {
    vi.mocked(enqueueRenderJob).mockReset();
    vi.mocked(getDefaultChannel).mockReset();
    vi.mocked(isSourceUrlIngested).mockReset();
    vi.mocked(isSourceUrlIngested).mockResolvedValue(false);
  });

  it("rejects malformed bodies", async () => {
    const res = await POST(new Request("http://t/", { method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
  });

  it("enqueues a clip_ingest job for a valid URL", async () => {
    vi.mocked(getDefaultChannel).mockResolvedValue({ id: "ch1", niche_id: "n1" } as any);
    vi.mocked(enqueueRenderJob).mockResolvedValue({ id: "job-id" } as any);
    const res = await POST(new Request("http://t/", {
      method: "POST",
      body: JSON.stringify({ url: "https://www.youtube.com/shorts/ABC123" }),
    }));
    expect(res.status).toBe(200);
    expect(enqueueRenderJob).toHaveBeenCalledWith(expect.anything(), {
      jobType: "clip_ingest",
      payload: expect.objectContaining({
        source_url: "https://www.youtube.com/shorts/ABC123",
        niche_id: "n1",
        channel_id: "ch1",
        added_by: "manual",
      }),
    });
  });

  it("returns 409 if URL already ingested", async () => {
    vi.mocked(isSourceUrlIngested).mockResolvedValue(true);
    const res = await POST(new Request("http://t/", {
      method: "POST",
      body: JSON.stringify({ url: "https://www.youtube.com/shorts/DUP" }),
    }));
    expect(res.status).toBe(409);
  });
});
