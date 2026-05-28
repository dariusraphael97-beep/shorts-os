import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ getServiceClient: () => ({}) }));
vi.mock("@/lib/supabase/repositories/compilation-drafts", () => ({
  getDraftById: vi.fn(),
  setPromotedYourVideoId: vi.fn(),
}));
vi.mock("@/lib/supabase/repositories/your-videos", () => ({
  createPromotedVideo: vi.fn(),
  slotIsOccupied: vi.fn(async () => false),
}));
vi.mock("@/lib/supabase/repositories/channels", () => ({
  getDefaultChannel: vi.fn(async () => ({
    id: "ch-1",
    timezone: "America/New_York",
    posting_schedule: { weekdays: ["07:30"], weekends: ["11:30"] },
  })),
}));
vi.mock("@/lib/supabase/repositories/render-jobs", () => ({
  enqueueRenderJob: vi.fn(async () => ({ id: "job-x" })),
}));
vi.mock("@/lib/timezone", () => ({
  nextOpenSlotAfter: vi.fn(),
  BacklogOverflowError: class extends Error {},
}));

import { POST } from "@/app/api/clips/rendered/[id]/approve/route";
import {
  getDraftById,
  setPromotedYourVideoId,
} from "@/lib/supabase/repositories/compilation-drafts";
import { createPromotedVideo } from "@/lib/supabase/repositories/your-videos";
import { nextOpenSlotAfter } from "@/lib/timezone";
import { DateTime } from "luxon";

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
    vi.mocked(nextOpenSlotAfter).mockReset();
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

  it("default (no action param) schedules with status=scheduled + scheduled_for", async () => {
    vi.mocked(getDraftById).mockResolvedValue(fakeDraft() as never);
    vi.mocked(createPromotedVideo).mockResolvedValue(VIDEO_ID);
    vi.mocked(setPromotedYourVideoId).mockResolvedValue(undefined);
    vi.mocked(nextOpenSlotAfter).mockResolvedValue(DateTime.fromISO("2026-06-01T11:30:00Z"));
    const res = await POST(new Request("http://t/"), ctx());
    expect(res.status).toBe(200);
    expect(createPromotedVideo).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetStatus: "scheduled" }),
    );
    const body = await res.json();
    expect(body.your_video_id).toBe(VIDEO_ID);
    expect(body.scheduled_for).toBeTruthy();
  });
});
