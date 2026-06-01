import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ getServiceClient: vi.fn(() => ({})) }));
const getProduceVideoJobByTopic = vi.fn();
const getLatestYourVideoByTopic = vi.fn();
const getLatestCompilationDraftByTopic = vi.fn();
vi.mock("@/lib/supabase/repositories/jobs", () => ({
  getProduceVideoJobByTopic: (...a: unknown[]) => getProduceVideoJobByTopic(...a),
}));
vi.mock("@/lib/supabase/repositories/your-videos", () => ({
  getLatestYourVideoByTopic: (...a: unknown[]) => getLatestYourVideoByTopic(...a),
}));
vi.mock("@/lib/supabase/repositories/compilation-drafts", () => ({
  getLatestCompilationDraftByTopic: (...a: unknown[]) => getLatestCompilationDraftByTopic(...a),
}));

import { GET } from "@/app/api/niches/[id]/generation/route";

function req(topicId?: string) {
  const url = topicId ? `http://x/api/niches/c1/generation?topicId=${topicId}` : `http://x/api/niches/c1/generation`;
  return new Request(url);
}
const ctx = { params: Promise.resolve({ id: "c1" }) };

beforeEach(() => { vi.clearAllMocks(); });

describe("GET /api/niches/[id]/generation", () => {
  it("400s without topicId", async () => {
    const res = await GET(req(), ctx);
    expect(res.status).toBe(400);
  });
  it("returns null job when none exists", async () => {
    getProduceVideoJobByTopic.mockResolvedValue(null);
    const res = await GET(req("t1"), ctx);
    const body = await res.json();
    expect(body).toEqual({ job: null, result: null });
  });
  it("returns running job + null result", async () => {
    getProduceVideoJobByTopic.mockResolvedValue({ status: "running", current_agent: "writer", progress_pct: 60 });
    const res = await GET(req("t1"), ctx);
    const body = await res.json();
    expect(body.job).toEqual({ status: "running", currentAgent: "writer", progressPct: 60 });
    expect(body.result).toBeNull();
  });
  it("resolves your_video on success", async () => {
    getProduceVideoJobByTopic.mockResolvedValue({ status: "succeeded", current_agent: "director", progress_pct: 100 });
    getLatestYourVideoByTopic.mockResolvedValue({ id: "yv1" });
    const res = await GET(req("t1"), ctx);
    const body = await res.json();
    expect(body.result).toEqual({ kind: "your_video", videoId: "yv1" });
  });
  it("resolves compilation on success when no your_video", async () => {
    getProduceVideoJobByTopic.mockResolvedValue({ status: "succeeded", current_agent: "composer", progress_pct: 100 });
    getLatestYourVideoByTopic.mockResolvedValue(null);
    getLatestCompilationDraftByTopic.mockResolvedValue({ id: "cd1" });
    const res = await GET(req("t1"), ctx);
    const body = await res.json();
    expect(body.result).toEqual({ kind: "compilation", draftId: "cd1" });
  });
});
