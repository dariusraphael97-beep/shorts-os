// src/app/api/render/debug/route.ts
//
// Phase 1 debugging endpoint. Mimics VercelSandboxRenderWorker.dispatch but runs
// every command synchronously and captures stdout/stderr/exitCode for each step.
// Returns the full transcript as JSON so we can see exactly where the sandbox
// fails. Not part of production pipeline; remove (or gate behind admin auth)
// once Phase 1 benchmark passes.
//
// Auth: requires CRON_SECRET (same as crons).
//
// Query params:
//   - your_video_id (required): the your_videos row whose script to render.
//                                If omitted, just verifies sandbox + git + npm ci
//                                without running the actual worker.
import 'server-only';
import { NextResponse } from 'next/server';
import { Sandbox } from '@vercel/sandbox';

export const maxDuration = 300;

function getGitSource(): { url: string; ref: string } {
  const owner = process.env.VERCEL_GIT_REPO_OWNER;
  const slug = process.env.VERCEL_GIT_REPO_SLUG;
  const ref = process.env.SANDBOX_GIT_REF ?? process.env.VERCEL_GIT_COMMIT_SHA;
  if (!owner || !slug || !ref) {
    throw new Error(`Missing git context: owner=${owner} slug=${slug} ref=${ref}`);
  }
  return { url: `https://github.com/${owner}/${slug}.git`, ref };
}

async function readCommandLogs(cmd: { logs(): AsyncIterable<{ stream: 'stdout' | 'stderr'; data: string }> }): Promise<{ stdout: string; stderr: string }> {
  let stdout = '';
  let stderr = '';
  try {
    for await (const log of cmd.logs()) {
      if (log.stream === 'stdout') stdout += log.data;
      else if (log.stream === 'stderr') stderr += log.data;
    }
  } catch (err) {
    stderr += `\n[logs() iteration error: ${err instanceof Error ? err.message : String(err)}]`;
  }
  return { stdout, stderr };
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const transcript: Array<Record<string, unknown>> = [];
  const t0 = Date.now();
  const t = () => Math.round((Date.now() - t0) / 100) / 10;
  let sandboxName: string | undefined;

  try {
    const { url: repoUrl, ref: gitRef } = getGitSource();
    transcript.push({ step: 'getGitSource', elapsed: t(), url: repoUrl, ref: gitRef });

    sandboxName = `debug-${Date.now()}`;
    const sandbox = await Sandbox.create({
      name: sandboxName,
      runtime: 'node24',
      timeout: 10 * 60 * 1000,
      source: { type: 'git', url: repoUrl, revision: gitRef },
    });
    transcript.push({ step: 'Sandbox.create', elapsed: t(), name: sandbox.name });

    // Step 1: probe — verify sandbox alive + git clone happened
    const probeCmd = await sandbox.runCommand({ cmd: 'ls', args: ['-la'] });
    const probe = await readCommandLogs(probeCmd);
    transcript.push({
      step: 'ls -la (cwd)',
      elapsed: t(),
      exitCode: 'exitCode' in probeCmd ? probeCmd.exitCode : null,
      stdout: probe.stdout.slice(0, 800),
      stderr: probe.stderr.slice(0, 400),
    });

    // Step 2: verify scripts/render-worker is present
    const lsWorker = await sandbox.runCommand({ cmd: 'ls', args: ['-la', 'scripts/render-worker/'] });
    const lsWorkerOut = await readCommandLogs(lsWorker);
    transcript.push({
      step: 'ls scripts/render-worker',
      elapsed: t(),
      exitCode: 'exitCode' in lsWorker ? lsWorker.exitCode : null,
      stdout: lsWorkerOut.stdout.slice(0, 800),
      stderr: lsWorkerOut.stderr.slice(0, 400),
    });

    // Step 3: npm ci for worker
    const npmCi = await sandbox.runCommand({
      cmd: 'npm',
      args: ['ci', '--prefix', 'scripts/render-worker'],
    });
    const npmCiOut = await readCommandLogs(npmCi);
    transcript.push({
      step: 'npm ci',
      elapsed: t(),
      exitCode: 'exitCode' in npmCi ? npmCi.exitCode : null,
      stdout: npmCiOut.stdout.slice(0, 2000),
      stderr: npmCiOut.stderr.slice(0, 2000),
    });

    // Step 4: probe — verify node + tsx works
    const nodeProbe = await sandbox.runCommand({
      cmd: 'node',
      args: ['--version'],
    });
    const nodeProbeOut = await readCommandLogs(nodeProbe);
    transcript.push({
      step: 'node --version',
      elapsed: t(),
      exitCode: 'exitCode' in nodeProbe ? nodeProbe.exitCode : null,
      stdout: nodeProbeOut.stdout.slice(0, 200),
      stderr: nodeProbeOut.stderr.slice(0, 200),
    });

    // Step 5: probe — tsx works with --import?
    const tsxProbe = await sandbox.runCommand({
      cmd: 'node',
      args: ['--import', 'tsx', '-e', 'console.log("tsx ok")'],
      cwd: '/vercel/sandbox/scripts/render-worker',
    });
    const tsxProbeOut = await readCommandLogs(tsxProbe);
    transcript.push({
      step: 'node --import tsx -e "console.log(\\"tsx ok\\")"',
      elapsed: t(),
      exitCode: 'exitCode' in tsxProbe ? tsxProbe.exitCode : null,
      stdout: tsxProbeOut.stdout.slice(0, 400),
      stderr: tsxProbeOut.stderr.slice(0, 800),
    });

    return NextResponse.json({
      ok: true,
      totalElapsedSec: t(),
      sandboxName,
      transcript,
    });
  } catch (err) {
    transcript.push({
      step: 'FATAL',
      elapsed: t(),
      error: err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
    });
    return NextResponse.json({ ok: false, sandboxName, transcript }, { status: 500 });
  }
}
