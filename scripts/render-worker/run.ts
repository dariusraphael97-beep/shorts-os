// scripts/render-worker/run.ts
//
// Sandbox-side entrypoint. Reads job id + callback token from argv, fetches the
// render_jobs row, routes to the matching handler, then POSTs the result to
// the Next.js callback endpoint.
import { spawn } from 'node:child_process';
import { getSupabase } from './lib/supabase.ts';
import { postCallback } from './lib/callback.ts';
import { runClipIngest, ClipIngestError } from './handlers/clip-ingest.ts';
import { runRenderF1, RenderF1Error } from './handlers/render-f1.ts';
import { runRenderF2, RenderF2Error } from './handlers/render-f2.ts';
import { runUpload, UploadHandlerError } from './handlers/upload.ts';

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

  // Phase 2.5: install Chromium system libs on cold-start so Remotion can launch.
  // Vercel Sandbox is Amazon Linux 2023; ~15s overhead per cold Sandbox.
  // Idempotent — re-running is a fast no-op since rpm tracks installed packages.
  await installChromiumDeps();

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
      case 'render_f2':    output = await runRenderF2(job, supabase); break;
      case 'upload':       output = await runUpload(job, supabase); break;
      default: throw new Error(`unknown job_type: ${job.job_type}`);
    }
    await postCallback({ jobId, jobToken, sandboxInvocationId, result: { status: 'succeeded', output } });
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    const trace =
      err instanceof RenderF1Error ? err.trace
      : err instanceof RenderF2Error ? err.trace
      : err instanceof ClipIngestError ? err.trace
      : err instanceof UploadHandlerError ? err.trace
      : undefined;
    await postCallback({
      jobId, jobToken, sandboxInvocationId,
      result: { status: 'failed', error: msg, output: trace ? { debug_trace: trace } : undefined },
    });
  }
}

main().catch(err => { console.error('fatal:', err); process.exit(1); });

function installChromiumDeps(): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'sudo',
      ['yum', 'install', '-y', '-q',
        'nspr', 'nss', 'atk', 'at-spi2-atk', 'cups-libs', 'libdrm', 'libxkbcommon',
        'libXcomposite', 'libXdamage', 'libXfixes', 'libXrandr', 'mesa-libgbm',
        'alsa-lib', 'pango', 'cairo', 'libxshmfence',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 }
    );
    let err = '';
    proc.stderr.on('data', (d) => { err += d; });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`yum install Chromium deps failed exit=${code}: ${err.slice(-1000)}`));
      else resolve();
    });
  });
}
