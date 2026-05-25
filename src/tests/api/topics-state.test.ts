import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  getServiceClient: vi.fn().mockReturnValue({}),
}));

vi.mock("@/lib/supabase/repositories/topic-queue", () => ({
  updateTopicState: vi.fn(),
}));

import { POST } from "@/app/api/topics/[id]/state/route";
import { updateTopicState } from "@/lib/supabase/repositories/topic-queue";

function makeReq(body: unknown) {
  return new Request("http://test/api/topics/abc-123/state", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/topics/[id]/state", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts state=reviewed", async () => {
    const res = await POST(makeReq({ state: "reviewed" }), { params: Promise.resolve({ id: "abc-123" }) });
    expect(res.status).toBe(200);
    expect(updateTopicState).toHaveBeenCalledWith(expect.anything(), "abc-123", "reviewed", null);
  });

  it("accepts state=rejected with reason", async () => {
    const res = await POST(makeReq({ state: "rejected", reason: "duplicate" }), {
      params: Promise.resolve({ id: "abc-123" }),
    });
    expect(res.status).toBe(200);
    expect(updateTopicState).toHaveBeenCalledWith(expect.anything(), "abc-123", "rejected", "duplicate");
  });

  it("400s on invalid state", async () => {
    const res = await POST(makeReq({ state: "deleted" }), { params: Promise.resolve({ id: "abc-123" }) });
    expect(res.status).toBe(400);
  });

  it("500s when repo throws", async () => {
    (updateTopicState as any).mockRejectedValueOnce(new Error("db boom"));
    const res = await POST(makeReq({ state: "reviewed" }), { params: Promise.resolve({ id: "abc-123" }) });
    expect(res.status).toBe(500);
  });
});
