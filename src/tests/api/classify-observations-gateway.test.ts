import { describe, it, expect, vi, beforeEach } from "vitest";

// The classify-observations cron used to call assertGatewayConfigured() BEFORE
// runWithIngestionLog and return 500 in a catch that didn't log — so a missing
// AI_GATEWAY_API_KEY failed completely silently (no ingestion_runs row, no log).
// The fix moves the gateway check INSIDE runWithIngestionLog so the failure is
// recorded as a `failed` run row (visible on /admin/ingestion-health).

vi.mock("@/lib/scrapers/shared", () => ({
  assertCronAuth: vi.fn(),
  serializeError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  scraperLog: () => ({}),
}));
vi.mock("@/lib/supabase/server", () => ({ getServiceClient: vi.fn(() => ({})) }));
vi.mock("@/lib/ai/models", () => ({
  assertGatewayConfigured: vi.fn(() => {
    throw new Error("AI_GATEWAY_API_KEY not set — required for the AI Gateway classifier/embeddings");
  }),
}));

const startIngestionRun = vi.fn((..._a: unknown[]) => Promise.resolve({ id: "run-1" }));
const finishIngestionRun = vi.fn((..._a: unknown[]) => Promise.resolve({}));
vi.mock("@/lib/supabase/repositories/ingestion-runs", () => ({
  startIngestionRun: (...a: unknown[]) => startIngestionRun(...a),
  finishIngestionRun: (...a: unknown[]) => finishIngestionRun(...a),
}));

// Referenced when building the runClassification args — never reached because the
// gateway check throws first, but the module imports must resolve.
vi.mock("@/lib/supabase/repositories/shorts-observations", () => ({ listUnclassifiedObservations: vi.fn() }));
vi.mock("@/lib/supabase/repositories/shorts-classifications", () => ({ upsertClassification: vi.fn() }));
vi.mock("@/lib/supabase/repositories/classification-samples", () => ({ insertClassificationSample: vi.fn() }));
vi.mock("@/lib/ingestion/classify-observations", () => ({ runClassification: vi.fn(), buildGatewayDeps: vi.fn() }));

import { GET } from "@/app/api/cron/classify-observations/route";

beforeEach(() => { vi.clearAllMocks(); });

describe("classify-observations cron — gateway-config failure is recorded", () => {
  it("records a FAILED ingestion run (not a silent pre-run 500) when the gateway is unconfigured", async () => {
    const res = await GET(new Request("http://x/api/cron/classify-observations"));
    expect(res.status).toBe(500);
    // The fix: the gateway check runs INSIDE runWithIngestionLog, so a run is
    // started and then finished as `failed` with the error — visible, not silent.
    expect(startIngestionRun).toHaveBeenCalled();
    expect(finishIngestionRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "failed", error: expect.stringContaining("AI_GATEWAY_API_KEY") }),
    );
  });
});
