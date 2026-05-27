import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ getServiceClient: () => ({}) }));
vi.mock("@/lib/supabase/repositories/compilation-drafts", () => ({
  getDraftById: vi.fn(),
  setPromotedYourVideoId: vi.fn(),
}));
vi.mock("@/lib/supabase/repositories/your-videos", () => ({
  createPromotedVideo: vi.fn(),
}));

import { POST } from "@/app/api/clips/rendered/[id]/approve/route";
import {
  getDraftById,
  setPromotedYourVideoId,
} from "@/lib/supabase/repositories/compilation-drafts";
import { createPromotedVideo } from "@/lib/supabase/repositories/your-videos";

const DRAFT_ID = "66666666-6666-4666-8666-666666666666";
const VIDEO_ID = "77777777-7777-4777-8777-777777777777";

function ctx() {
  return { params: Promise.resolve({ id: DRAFT_ID }) };
}

function fakeDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: DRAFT_ID,
    channel_id: "ch-1",
    status: "rendered",
    rendered_path: "https://blob/x.mp4",
    title_template: "TOP 5 X",
    clip_refs: [1, 2, 3, 4, 5].map((n) => ({
      clip_id: `c${n}`,
      start_sec: 0,
      end_sec: 6,
      label: `c ${n}`,
      order: n,
    })),
    ...overrides,
  };
}

describe("POST /api/clips/rendered/[id]/approve", () => {
  beforeEach(() => {
    vi.mocked(getDraftById).mockReset();
    vi.mocked(setPromotedYourVideoId).mockReset();
    vi.mocked(createPromotedVideo).mockReset();
  });

  it("404s when draft missing", async () => {
    vi.mocked(getDraftById).mockResolvedValue(null);
    const res = await POST(new Request("http://t/"), ctx());
    expect(res.status).toBe(404);
  });

  it("409s when draft not in rendered status", async () => {
    vi.mocked(getDraftById).mockResolvedValue(fakeDraft({ status: "proposed" }) as never);
    const res = await POST(new Request("http://t/"), ctx());
    expect(res.status).toBe(409);
    expect(createPromotedVideo).not.toHaveBeenCalled();
  });

  it("422s when rendered_path is missing", async () => {
    vi.mocked(getDraftById).mockResolvedValue(fakeDraft({ rendered_path: null }) as never);
    const res = await POST(new Request("http://t/"), ctx());
    expect(res.status).toBe(422);
  });

  it("creates your_videos row + flips draft to posted on happy path", async () => {
    vi.mocked(getDraftById).mockResolvedValue(fakeDraft() as never);
    vi.mocked(createPromotedVideo).mockResolvedValue(VIDEO_ID);
    vi.mocked(setPromotedYourVideoId).mockResolvedValue(undefined);
    const res = await POST(new Request("http://t/"), ctx());
    expect(res.status).toBe(200);
    expect(createPromotedVideo).toHaveBeenCalledWith(expect.anything(), {
      channelId: "ch-1",
      title: "TOP 5 X",
      renderArtifactUrl: "https://blob/x.mp4",
      durationSeconds: 30,
      sourceCompilationDraftId: DRAFT_ID,
    });
    expect(setPromotedYourVideoId).toHaveBeenCalledWith(expect.anything(), {
      id: DRAFT_ID,
      your_video_id: VIDEO_ID,
    });
    const body = await res.json();
    expect(body.your_video_id).toBe(VIDEO_ID);
  });
});
