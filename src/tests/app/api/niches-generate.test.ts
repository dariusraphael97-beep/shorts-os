import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/server", async (orig) => {
  const actual = await orig<typeof import("next/server")>();
  return { ...actual, after: (fn: () => unknown) => { void fn(); } };
});
vi.mock("@/lib/supabase/server", () => ({ getServiceClient: vi.fn(() => ({})) }));
const getClusterById = vi.fn();
vi.mock("@/lib/supabase/repositories/niche-clusters", () => ({ getClusterById: (...a: unknown[]) => getClusterById(...a) }));
const clusterToBrief = vi.fn();
vi.mock("@/lib/niches/cluster-brief", () => ({ clusterToBrief: (...a: unknown[]) => clusterToBrief(...a) }));
const insertManualTopic = vi.fn();
vi.mock("@/lib/supabase/repositories/topic-queue", () => ({ insertManualTopic: (...a: unknown[]) => insertManualTopic(...a) }));
const recordNicheAction = vi.fn();
vi.mock("@/lib/supabase/repositories/niche-actions", () => ({ recordNicheAction: (...a: unknown[]) => recordNicheAction(...a) }));
const getActiveProduceVideoJob = vi.fn();
vi.mock("@/lib/supabase/repositories/jobs", () => ({ getActiveProduceVideoJob: (...a: unknown[]) => getActiveProduceVideoJob(...a) }));
const drainPipeline = vi.fn();
vi.mock("@/lib/agents/auto-dispatch", () => ({ drainPipeline: (...a: unknown[]) => drainPipeline(...a) }));

import { POST } from "@/app/api/niches/[id]/generate/route";

const ctx = { params: Promise.resolve({ id: "c1" }) };
function post() { return new Request("http://x/api/niches/c1/generate", { method: "POST" }); }

beforeEach(() => {
  vi.clearAllMocks();
  getClusterById.mockResolvedValue({ id: "c1", canonical_topic: "Vienna", format_label: "narrated_history", audience_signal: "x", example_video_ids: [], production_fit: "native" });
  clusterToBrief.mockReturnValue({ title: "Vienna", summary: "s", rawPayload: { clusterId: "c1" } });
  insertManualTopic.mockResolvedValue({ id: "t1" });
  recordNicheAction.mockResolvedValue(undefined);
});

describe("POST /api/niches/[id]/generate", () => {
  it("404s on unknown cluster", async () => {
    getClusterById.mockResolvedValue(null);
    const res = await POST(post(), ctx);
    expect(res.status).toBe(404);
  });
  it("409s when a generation is already running", async () => {
    getActiveProduceVideoJob.mockResolvedValue({ id: "job-x" });
    const res = await POST(post(), ctx);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("generation_in_progress");
    expect(drainPipeline).not.toHaveBeenCalled();
  });
  it("dispatches: schedules drainPipeline + returns dispatched true (no stub draft)", async () => {
    getActiveProduceVideoJob.mockResolvedValue(null);
    const res = await POST(post(), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, dispatched: true, topicId: "t1" });
    expect(drainPipeline).toHaveBeenCalledWith(expect.objectContaining({ topicId: "t1", sourceNicheClusterId: "c1", scriptBrief: { clusterId: "c1" } }));
    expect(recordNicheAction).toHaveBeenCalled();
  });
  it("422s on non-native (clusterToBrief throws)", async () => {
    getActiveProduceVideoJob.mockResolvedValue(null);
    clusterToBrief.mockImplementation(() => { throw new Error("not native"); });
    const res = await POST(post(), ctx);
    expect(res.status).toBe(422);
  });
});
