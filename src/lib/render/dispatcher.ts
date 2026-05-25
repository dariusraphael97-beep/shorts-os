// src/lib/render/dispatcher.ts
//
// Run by the render-dispatcher cron every 60 seconds. Claims pending render_jobs
// (atomic, via the claim_render_jobs Postgres function), then dispatches each
// to the configured RenderWorker. Workers return immediately (detached); they
// POST back to /api/render/complete when done.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  claimPendingJobs, markJobRunning, markJobFailed,
} from '@/lib/supabase/repositories/render-jobs';
import { signCallbackToken } from '@/lib/render/callback-token';
import type { RenderWorker } from '@/lib/render/workers/types';

export interface DispatcherResult {
  claimed: number;
  failed: number;
}

export async function runDispatcher(args: {
  supabase: SupabaseClient;
  worker: RenderWorker;
  now: Date;
}): Promise<DispatcherResult> {
  const concurrency = parseInt(process.env.RENDER_CONCURRENCY ?? '4', 10);
  const claimed = await claimPendingJobs(args.supabase, { limit: concurrency });
  let failed = 0;

  for (const job of claimed) {
    try {
      const token = signCallbackToken({ jobId: job.id, ttlSeconds: 15 * 60 });
      const { invocationId } = await args.worker.dispatch(job, token);
      await markJobRunning(args.supabase, { jobId: job.id, sandboxInvocationId: invocationId });
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      await markJobFailed(args.supabase, { jobId: job.id, error: `dispatcher_failed: ${msg}` });
    }
  }
  return { claimed: claimed.length, failed };
}
