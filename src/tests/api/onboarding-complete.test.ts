import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ getServiceClient: vi.fn(() => ({})) }));
const getDefaultChannel = vi.fn(async () => ({ id: "ch-1" }));
const saveOnboarding = vi.fn(async () => {});
const markOnboardingComplete = vi.fn(async () => {});
vi.mock("@/lib/supabase/repositories/channels", () => ({
  getDefaultChannel: (...a: Parameters<typeof getDefaultChannel>) => getDefaultChannel(...a),
  saveOnboarding: (...a: Parameters<typeof saveOnboarding>) => saveOnboarding(...a),
  markOnboardingComplete: (...a: Parameters<typeof markOnboardingComplete>) => markOnboardingComplete(...a),
}));
const triggerIngestion = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/ingestion/registry", () => ({
  triggerIngestion: (...a: Parameters<typeof triggerIngestion>) => triggerIngestion(...a),
  TRIGGERABLE_JOBS: ["youtube_shorts_search"],
}));
vi.mock("@/lib/env", () => ({ loadEnv: () => ({ CRON_SECRET: "s" }) }));

import { POST } from "@/app/api/onboarding/complete/route";

function req(body: unknown) {
  return new Request("http://x/api/onboarding/complete", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => { saveOnboarding.mockClear(); markOnboardingComplete.mockClear(); triggerIngestion.mockClear(); });

describe("POST /api/onboarding/complete", () => {
  it("400s on an invalid goal", async () => {
    const res = await POST(req({ creatorGoals: "nope", interests: [] }));
    expect(res.status).toBe(400);
  });
  it("persists, marks complete, enqueues a scan, returns 200", async () => {
    const res = await POST(req({ creatorGoals: "monetize", interests: ["ai"] }));
    expect(res.status).toBe(200);
    expect(saveOnboarding).toHaveBeenCalled();
    expect(markOnboardingComplete).toHaveBeenCalledWith(expect.anything(), "ch-1");
    expect(triggerIngestion).toHaveBeenCalled();
  });
  it("still returns 200 when the scan enqueue fails (fire-and-forget)", async () => {
    triggerIngestion.mockRejectedValueOnce(new Error("network"));
    const res = await POST(req({ creatorGoals: "other", interests: [] }));
    expect(res.status).toBe(200);
    expect(markOnboardingComplete).toHaveBeenCalled();
  });
});
