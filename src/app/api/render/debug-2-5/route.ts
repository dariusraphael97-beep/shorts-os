// src/app/api/render/debug-2-5/route.ts
//
// Phase 2.5 cold-start probe. Spins up a Sandbox, runs npm ci in the
// worker package, then `npx remotion --version`. Captures per-step timing.
// CRON_SECRET-auth'd; called manually with curl during plan execution.
// DELETE this route at the end of Phase 2.5.
import 'server-only';
import { NextResponse } from 'next/server';
import { Sandbox } from '@vercel/sandbox';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function getGitSource(): { url: string; ref: string; username?: string; password?: string } {
  const url =
    process.env.SANDBOX_GIT_URL ??
    (process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
      ? `https://github.com/${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}.git`
      : undefined);
  const ref = process.env.SANDBOX_GIT_REF ?? process.env.VERCEL_GIT_COMMIT_SHA;
  if (!url || !ref) throw new Error('Cannot determine git source for sandbox probe');
  return {
    url,
    ref,
    username: process.env.SANDBOX_GIT_USERNAME,
    password: process.env.SANDBOX_GIT_PASSWORD,
  };
}

export async function GET(req: Request): Promise<Response> {
  const auth = req.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { url: repoUrl, ref, username, password } = getGitSource();
  const t0 = Date.now();
  const stages: Record<string, number | string> = {};

  const sandbox = await Sandbox.create({
    name: `phase-2-5-coldstart-${Date.now()}`,
    runtime: 'node24',
    timeout: 5 * 60 * 1000,
    source: username && password
      ? { type: 'git', url: repoUrl, revision: ref, username, password }
      : { type: 'git', url: repoUrl, revision: ref },
  });
  stages.sandbox_create_ms = Date.now() - t0;

  const tInstall = Date.now();
  const npmCi = await sandbox.runCommand({
    cmd: 'npm',
    args: ['ci', '--prefix', 'scripts/render-worker'],
  });
  stages.npm_ci_ms = Date.now() - tInstall;
  stages.npm_ci_exit = npmCi.exitCode ?? -1;

  const tVersion = Date.now();
  const versionCmd = await sandbox.runCommand({
    cmd: 'npx',
    args: ['remotion', '--version'],
    cwd: '/vercel/sandbox/scripts/render-worker',
  });
  stages.remotion_version_ms = Date.now() - tVersion;
  stages.remotion_version_exit = versionCmd.exitCode ?? -1;
  stages.remotion_version_stdout = (await versionCmd.stdout()).trim();

  const total = Date.now() - t0;
  const pass = total <= 120_000;

  return NextResponse.json({
    pass,
    total_ms: total,
    gate_ms: 120_000,
    stages,
    sandbox_name: sandbox.name,
  });
}
