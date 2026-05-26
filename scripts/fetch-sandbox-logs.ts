// scripts/fetch-sandbox-logs.ts
//
// Throwaway: fetch the Sandbox's stdout/stderr by name (the run_jobs.sandbox_invocation_id).
// Usage: VERCEL_TOKEN=... vercel sandbox logs --name <sandbox-name>  — but the Vercel CLI
// doesn't expose a `sandbox logs` command yet. So we go through the SDK.
import { Sandbox } from '@vercel/sandbox';

const name = process.argv[2];
if (!name) {
  console.error('Usage: tsx scripts/fetch-sandbox-logs.ts <sandbox-name>');
  process.exit(1);
}

(async () => {
  const sb = await Sandbox.get({ name });
  const logs = await sb.logs();
  // logs() returns an async iterable of { stream: 'stdout'|'stderr', data: string }
  for await (const ev of logs as AsyncIterable<{ stream: string; data: string }>) {
    process.stdout.write(`[${ev.stream}] ${ev.data}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
