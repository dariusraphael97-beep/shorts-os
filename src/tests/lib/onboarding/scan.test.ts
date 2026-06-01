import { describe, it, expect, vi } from "vitest";
import { runOnboardingScan, assembleScanStatus } from "@/lib/onboarding/scan";
import type { IngestionRunRow } from "@/lib/supabase/repositories/ingestion-runs";

function run(job: IngestionRunRow["job"], status: IngestionRunRow["status"], items = 0): IngestionRunRow {
  return { id: job, job, status, started_at: "2026-05-31T00:00:00Z", finished_at: status === "partial" ? null : "2026-05-31T00:01:00Z", items_ingested: items, items_skipped: 0, quota_units: 0, error: null, context: {} };
}

describe("runOnboardingScan", () => {
  it("runs the 3 scan jobs in order, continuing past a failure", async () => {
    const calls: string[] = [];
    const trigger = vi.fn(async ({ job }: { job: string }) => { calls.push(job); if (job === "classify_observations") throw new Error("x"); return { ok: false, status: 500, body: null }; });
    await runOnboardingScan({ origin: "http://x", secret: "s", trigger });
    expect(calls).toEqual(["youtube_shorts_search", "classify_observations", "cluster_niches"]);
  });
});

describe("assembleScanStatus", () => {
  it("derives ordered steps + clustersFound + done", () => {
    const out = assembleScanStatus([
      run("youtube_shorts_search", "success", 40),
      run("classify_observations", "success", 38),
      run("cluster_niches", "success", 6),
    ]);
    expect(out.steps.map((s) => s.job)).toEqual(["youtube_shorts_search", "classify_observations", "cluster_niches"]);
    expect(out.clustersFound).toBe(6);
    expect(out.done).toBe(true);
  });
  it("done is false while any step is still partial/missing", () => {
    const out = assembleScanStatus([run("youtube_shorts_search", "partial")]);
    expect(out.done).toBe(false);
    expect(out.steps.find((s) => s.job === "cluster_niches")?.status).toBe("pending");
  });
});
