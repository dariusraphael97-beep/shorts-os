// scripts/render-worker/poll.ts
//
// Local render-worker daemon. Polls the render_jobs queue, runs longform renders on THIS
// machine (Higgsfield CLI + ffmpeg), and writes results straight back to Supabase. This is
// the local counterpart to the cloud Sandbox path (scripts/render-worker/run.ts).
//
// Run from the repo root:  npm run render-worker
//
// Defensive env: the daemon talks to Anthropic (vision) during reference-driven renders,
// so we unset ANTHROPIC_BASE_URL (a Claude Code shell sets it, which 404s the AI SDK),
// and default Higgsfield on with a safe concurrency for reference-driven gens.
delete process.env.ANTHROPIC_BASE_URL;
process.env.HIGGSFIELD_ENABLED ??= '1';
process.env.HIGGSFIELD_CONCURRENCY ??= '2';

import { getSupabase } from './lib/supabase.ts';
import { runRenderLongform } from './handlers/render-longform.ts';
import { claimOne, markRunning, markSucceeded, markFailed } from './lib/jobs.ts';
import { longformRenderUpdate, type LongformRenderOutput } from './lib/longform-complete.ts';

const IDLE_POLL_MS = 4_000;

async function processJob(supabase: ReturnType<typeof getSupabase>, job: Awaited<ReturnType<typeof claimOne>>): Promise<void> {
  if (!job) return;
  console.log(`[worker] claimed job ${job.id} (${job.job_type})`);
  await markRunning(supabase, job.id);
  try {
    if (job.job_type !== 'render_longform') {
      throw new Error(`local worker only handles render_longform (got ${job.job_type})`);
    }
    const output = (await runRenderLongform(job, supabase)) as LongformRenderOutput;
    if (job.your_video_id) {
      const { error } = await supabase.from('your_videos').update(longformRenderUpdate(output)).eq('id', job.your_video_id);
      if (error) throw new Error(`apply result: ${error.message}`);
    }
    await markSucceeded(supabase, job.id);
    console.log(`[worker] job ${job.id} done → ${output.render_artifact_url ?? '(no url)'}`);
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    console.error(`[worker] job ${job.id} failed:`, msg);
    await markFailed(supabase, job.id, msg);
    if (job.your_video_id) {
      await supabase.from('your_videos').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', job.your_video_id);
    }
  }
}

async function main(): Promise<void> {
  const supabase = getSupabase();
  console.log('[worker] local render-worker started — polling render_jobs…');
  let running = true;
  process.on('SIGINT', () => { console.log('\n[worker] shutting down after current job…'); running = false; });
  while (running) {
    let job = null;
    try {
      job = await claimOne(supabase);
    } catch (e) {
      console.error('[worker] claim error:', e instanceof Error ? e.message : e);
    }
    if (job) {
      // Never let a single job's failure (including failure-handling DB blips) kill the daemon.
      try {
        await processJob(supabase, job);
      } catch (e) {
        console.error(`[worker] unhandled error processing job ${job.id}:`, e instanceof Error ? e.stack ?? e.message : e);
      }
    } else {
      await new Promise((r) => setTimeout(r, IDLE_POLL_MS));
    }
  }
  console.log('[worker] stopped.');
}

main().catch((err) => { console.error('[worker] fatal:', err); process.exit(1); });
