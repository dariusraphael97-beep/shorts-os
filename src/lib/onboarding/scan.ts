// src/lib/onboarding/scan.ts
//
// The onboarding "first scan": a best-effort 3-job mini-run that materializes
// real niches (search → classify → cluster) so onboarding ends on niches, not
// raw observations. Plus a pure assembler that turns ingestion_runs into the
// scan-status feed payload.

import "server-only";
import { triggerIngestion } from "@/lib/ingestion/registry";
import type { IngestionJob, IngestionRunRow, IngestionStatus } from "@/lib/supabase/repositories/ingestion-runs";

export const SCAN_JOBS: IngestionJob[] = ["youtube_shorts_search", "classify_observations", "cluster_niches"];

type Trigger = typeof triggerIngestion;

export async function runOnboardingScan(args: { origin: string; secret: string; trigger?: Trigger }): Promise<void> {
  const trigger = args.trigger ?? triggerIngestion;
  for (const job of SCAN_JOBS) {
    try {
      await trigger({ job, origin: args.origin, secret: args.secret });
    } catch {
      // best-effort: a step failure must not abort the chain; first niches still
      // arrive at Monday's digest run.
    }
  }
}

export type ScanStepStatus = IngestionStatus | "pending";

export interface ScanStatus {
  steps: { job: IngestionJob; status: ScanStepStatus; itemsIngested: number }[];
  clustersFound: number;
  done: boolean;
}

export function assembleScanStatus(latestRuns: IngestionRunRow[]): ScanStatus {
  const byJob = new Map(latestRuns.map((r) => [r.job, r]));
  const steps = SCAN_JOBS.map((job) => {
    const r = byJob.get(job);
    let status: ScanStepStatus;
    if (!r) {
      status = "pending";
    } else if (r.finished_at != null) {
      status = r.status;
    } else {
      status = "partial";
    }
    return {
      job,
      status,
      itemsIngested: r?.items_ingested ?? 0,
    };
  });
  const clustersFound = byJob.get("cluster_niches")?.items_ingested ?? 0;
  const done = SCAN_JOBS.every((j) => byJob.get(j)?.finished_at != null);
  return { steps, clustersFound, done };
}
