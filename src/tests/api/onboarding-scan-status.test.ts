import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ getServiceClient: vi.fn(() => ({})) }));
const listLatestRunPerJob = vi.fn();
vi.mock("@/lib/supabase/repositories/ingestion-runs", () => ({
  listLatestRunPerJob: (...a: unknown[]) => listLatestRunPerJob(...a),
}));

import { GET } from "@/app/api/onboarding/scan-status/route";

describe("GET /api/onboarding/scan-status", () => {
  it("returns the assembled scan status", async () => {
    listLatestRunPerJob.mockResolvedValue([
      { id: "1", job: "youtube_shorts_search", status: "success", started_at: "t", finished_at: "t", items_ingested: 40, items_skipped: 0, quota_units: 0, error: null, context: {} },
      { id: "2", job: "cluster_niches", status: "success", started_at: "t", finished_at: "t", items_ingested: 6, items_skipped: 0, quota_units: 0, error: null, context: {} },
    ]);
    const res = await GET();
    const body = await res.json();
    expect(body.clustersFound).toBe(6);
    expect(body.steps).toHaveLength(3);
  });
});
