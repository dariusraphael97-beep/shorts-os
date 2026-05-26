// scripts/render-worker/run.ts
//
// Sandbox-side entrypoint. Reads job id + callback token from argv, fetches the
// render_jobs row, routes to the matching handler, then POSTs the result to
// the Next.js callback endpoint.
import { getSupabase } from './lib/supabase.ts';
import { postCallback } from './lib/callback.ts';
import { runClipIngest, ClipIngestError } from './handlers/clip-ingest.ts';
import { runRenderF1, RenderF1Error } from './handlers/render-f1.ts';
import { runRenderF2 } from './handlers/render-f2.ts';
import { runUpload } from './handlers/upload.ts';

const jobId = process.argv[2];
const jobToken = process.argv[3];
if (!jobId || !jobToken) {
  console.error('Usage: node run.ts <job_id> <jwt_token>');
  process.exit(1);
}

// Task 1.10 adaptation: SDK exposes name (not id); env var passed is VERCEL_SANDBOX_NAME
const sandboxInvocationId = process.env.VERCEL_SANDBOX_NAME ?? process.env.VERCEL_SANDBOX_ID ?? 'unknown';

async function main() {
  const supabase = getSupabase();
  const { data: job, error } = await supabase
    .from('render_jobs').select('*').eq('id', jobId).single();
  if (error || !job) {
    await postCallback({
      jobId, jobToken, sandboxInvocationId,
      result: { status: 'failed', error: `job not found: ${error?.message ?? 'no row'}` },
    });
    return;
  }
  try {
    let output: Record<string, unknown>;
    switch (job.job_type) {
      case 'clip_ingest':  output = await runClipIngest(job, supabase); break;
      case 'render_f1':    output = await runRenderF1(job, supabase); break;
      case 'render_f2':    output = await runRenderF2(); break;
      case 'upload':       output = await runUpload(); break;
      default: throw new Error(`unknown job_type: ${job.job_type}`);
    }
    await postCallback({ jobId, jobToken, sandboxInvocationId, result: { status: 'succeeded', output } });
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    const trace =
      err instanceof RenderF1Error ? err.trace
      : err instanceof ClipIngestError ? err.trace
      : undefined;
    await postCallback({
      jobId, jobToken, sandboxInvocationId,
      result: { status: 'failed', error: msg, output: trace ? { debug_trace: trace } : undefined },
    });
  }
}

main().catch(err => { console.error('fatal:', err); process.exit(1); });
