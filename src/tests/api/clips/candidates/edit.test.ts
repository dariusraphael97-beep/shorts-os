import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ getServiceClient: () => ({}) }));
vi.mock("@/lib/supabase/repositories/compilation-drafts", () => ({
  getDraftById: vi.fn(),
  updateDraftClipRefs: vi.fn(),
}));

import { POST } from "@/app/api/clips/candidates/[id]/edit/route";
import {
  getDraftById,
  updateDraftClipRefs,
} from "@/lib/supabase/repositories/compilation-drafts";

const DRAFT_ID = "33333333-3333-4333-8333-333333333333";
const CLIP_UUID = (n: number) =>
  `44444444-4444-4444-8444-44444444444${n.toString().padStart(1, "0")}`;
const MUSIC_ID = "55555555-5555-4555-8555-555555555555";

function ctx() {
  return { params: Promise.resolve({ id: DRAFT_ID }) };
}

const goodBody = {
  clip_refs: [1, 2, 3, 4, 5].map((n) => ({
    clip_id: CLIP_UUID(n),
    start_sec: 0,
    end_sec: 6,
    label: `clip ${n}`,
    order: n,
  })),
  music_track_id: MUSIC_ID,
};

describe("POST /api/clips/candidates/[id]/edit", () => {
  beforeEach(() => {
    vi.mocked(getDraftById).mockReset();
    vi.mocked(updateDraftClipRefs).mockReset();
  });

  it("400s on malformed body (wrong clip_refs length)", async () => {
    const res = await POST(
      new Request("http://t/", {
        method: "POST",
        body: JSON.stringify({ ...goodBody, clip_refs: goodBody.clip_refs.slice(0, 4) }),
      }),
      ctx(),
    );
    expect(res.status).toBe(400);
  });

  it("404s when draft missing", async () => {
    vi.mocked(getDraftById).mockResolvedValue(null);
    const res = await POST(
      new Request("http://t/", { method: "POST", body: JSON.stringify(goodBody) }),
      ctx(),
    );
    expect(res.status).toBe(404);
  });

  it("409s when draft already approved/rendering/rendered/posted", async () => {
    vi.mocked(getDraftById).mockResolvedValue({ id: DRAFT_ID, status: "approved" } as never);
    const res = await POST(
      new Request("http://t/", { method: "POST", body: JSON.stringify(goodBody) }),
      ctx(),
    );
    expect(res.status).toBe(409);
    expect(updateDraftClipRefs).not.toHaveBeenCalled();
  });

  it("writes new clip_refs + music_track_id on happy path", async () => {
    vi.mocked(getDraftById).mockResolvedValue({ id: DRAFT_ID, status: "proposed" } as never);
    vi.mocked(updateDraftClipRefs).mockResolvedValue(undefined);
    const res = await POST(
      new Request("http://t/", { method: "POST", body: JSON.stringify(goodBody) }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(updateDraftClipRefs).toHaveBeenCalledWith(expect.anything(), {
      id: DRAFT_ID,
      clip_refs: goodBody.clip_refs,
      music_track_id: MUSIC_ID,
    });
  });
});
