// src/lib/render/watchdog.ts
//
// Run by render-watchdog cron every 5 minutes. Resets jobs stuck in 'claimed' >5min
// (dispatcher crashed before kicking off Sandbox) or 'running' >30min (sandbox crashed
// without calling back). After attempts=3 the row stays 'failed' permanently.
// All logic is in the reset_stuck_render_jobs Postgres function.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resetStuckJobs } from '@/lib/supabase/repositories/render-jobs';

export async function runWatchdog(args: { supabase: SupabaseClient }): Promise<{ resetCount: number }> {
  const reset = await resetStuckJobs(args.supabase);
  return { resetCount: reset.length };
}
