import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ getServiceClient: () => ({}) }));
vi.mock("@/lib/supabase/repositories/compilation-drafts", () => ({
  getDraftById: vi.fn(),
  updateDraftStatus: vi.fn(),
}));

import { POST } from "@/app/api/clips/candidates/[id]/reject/route";
import {
  getDraftById,
  updateDraftStatus,
} from "@/lib/supabase/repositories/compilation-drafts";

const DRAFT_ID = "22222222-2222-4222-8222-222222222222";

function ctx() {
  return { params: Promise.resolve({ id: DRAFT_ID }) };
}

describe("POST /api/clips/candidates/[id]/reject", () => {
  beforeEach(() => {
    vi.mocked(getDraftById).mockReset();
    vi.mocked(updateDraftStatus).mockReset();
  });

  it("404s when draft is missing", async () => {
    vi.mocked(getDraftById).mockResolvedValue(null);
    const res = await POST(new Request("http://t/"), ctx());
    expect(res.status).toBe(404);
  });

  it("409s when draft is not proposed", async () => {
    vi.mocked(getDraftById).mockResolvedValue({ id: DRAFT_ID, status: "rendered" } as never);
    const res = await POST(new Request("http://t/"), ctx());
    expect(res.status).toBe(409);
  });

  it("transitions proposed → rejected on happy path", async () => {
    vi.mocked(getDraftById).mockResolvedValue({ id: DRAFT_ID, status: "proposed" } as never);
    vi.mocked(updateDraftStatus).mockResolvedValue(undefined);
    const res = await POST(new Request("http://t/"), ctx());
    expect(res.status).toBe(200);
    expect(updateDraftStatus).toHaveBeenCalledWith(expect.anything(), {
      id: DRAFT_ID,
      from: "proposed",
      to: "rejected",
    });
  });
});
