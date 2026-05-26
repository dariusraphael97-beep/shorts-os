// src/app/api/render/debug-2-5/route.ts
//
// Phase 2.5 debug probes. Two modes:
//   GET /api/render/debug-2-5             — cold-start gate measurement
//   GET /api/render/debug-2-5?step=font-probe — Gate 3 Stage 3a font hash check
// Both are CRON_SECRET-auth'd. DELETE this route at the end of Phase 2.5.
import 'server-only';
import { NextResponse } from 'next/server';
import { Sandbox } from '@vercel/sandbox';
import { writeFile } from 'node:fs/promises';
import expectedFingerprint from '../../../../../src/remotion/lib/font-fingerprint.json';
import { verifyFingerprint, type FontFingerprint } from '../../../../../scripts/render-worker/lib/glyph-hash';

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
    url, ref,
    username: process.env.SANDBOX_GIT_USERNAME,
    password: process.env.SANDBOX_GIT_PASSWORD,
  };
}

async function createSandboxForProbe(name: string) {
  const { url: repoUrl, ref, username, password } = getGitSource();
  return Sandbox.create({
    name: `${name}-${Date.now()}`,
    runtime: 'node24',
    timeout: 5 * 60 * 1000,
    source: username && password
      ? { type: 'git', url: repoUrl, revision: ref, username, password }
      : { type: 'git', url: repoUrl, revision: ref },
  });
}

export async function GET(req: Request): Promise<Response> {
  const auth = req.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  if (url.searchParams.get('step') === 'font-probe') {
    return runFontProbe();
  }
  return runColdStartProbe();
}

async function runColdStartProbe(): Promise<Response> {
  const t0 = Date.now();
  const stages: Record<string, number | string> = {};
  const sandbox = await createSandboxForProbe('phase-2-5-coldstart');
  stages.sandbox_create_ms = Date.now() - t0;

  const tInstall = Date.now();
  const npmCi = await sandbox.runCommand({
    cmd: 'npm', args: ['ci', '--prefix', 'scripts/render-worker'],
  });
  stages.npm_ci_ms = Date.now() - tInstall;
  stages.npm_ci_exit = npmCi.exitCode ?? -1;

  const tVersion = Date.now();
  const versionCmd = await sandbox.runCommand({
    cmd: 'npx', args: ['remotion', '--version'],
    cwd: '/vercel/sandbox/scripts/render-worker',
  });
  stages.remotion_version_ms = Date.now() - tVersion;
  stages.remotion_version_exit = versionCmd.exitCode ?? -1;
  stages.remotion_version_stdout = (await versionCmd.stdout()).trim();

  const total = Date.now() - t0;
  return NextResponse.json({
    pass: total <= 120_000,
    total_ms: total,
    gate_ms: 120_000,
    stages,
    sandbox_name: sandbox.name,
  });
}

async function runFontProbe(): Promise<Response> {
  const t0 = Date.now();
  const sandbox = await createSandboxForProbe('phase-2-5-fontprobe');

  const npmCi = await sandbox.runCommand({
    cmd: 'npm', args: ['ci', '--prefix', 'scripts/render-worker'],
  });
  if (npmCi.exitCode !== 0) {
    return NextResponse.json({
      stage: 'npm_ci', exit: npmCi.exitCode,
      stderr: (await npmCi.stderr()).slice(-2000),
    }, { status: 500 });
  }

  // Remotion's headless Chromium needs NSS/NSPR and other X11/graphics libs
  // that are not in the base Sandbox image. Update apt and install them.
  const aptUpdate = await sandbox.runCommand({
    cmd: 'apt-get',
    args: ['update', '-qq'],
    env: { DEBIAN_FRONTEND: 'noninteractive' },
  });
  if (aptUpdate.exitCode !== 0) {
    return NextResponse.json({
      stage: 'apt_update', exit: aptUpdate.exitCode,
      stderr: (await aptUpdate.stderr()).slice(-2000),
    }, { status: 500 });
  }

  const aptInstall = await sandbox.runCommand({
    cmd: 'apt-get',
    args: [
      'install', '-y', '--no-install-recommends',
      'libnspr4', 'libnss3', 'libatk1.0-0', 'libatk-bridge2.0-0',
      'libcups2', 'libdrm2', 'libxkbcommon0', 'libxcomposite1',
      'libxdamage1', 'libxfixes3', 'libxrandr2', 'libgbm1',
      'libasound2', 'libpango-1.0-0', 'libpangocairo-1.0-0',
    ],
    env: { DEBIAN_FRONTEND: 'noninteractive' },
  });
  if (aptInstall.exitCode !== 0) {
    return NextResponse.json({
      stage: 'apt_install', exit: aptInstall.exitCode,
      stderr: (await aptInstall.stderr()).slice(-2000),
    }, { status: 500 });
  }

  // Use `remotion still` for single-frame PNG output (not `render`, which
  // interprets a .png output path as an image sequence).
  const render = await sandbox.runCommand({
    cmd: 'npx',
    args: [
      'remotion', 'still',
      '/vercel/sandbox/src/remotion/index.tsx',
      'font-probe',
      '/tmp/font-probe.png',
      '--image-format=png',
      '--frame=0',
      '--log=warn',
    ],
    cwd: '/vercel/sandbox/scripts/render-worker',
  });
  if (render.exitCode !== 0) {
    return NextResponse.json({
      stage: 'remotion_render',
      exit: render.exitCode,
      stderr: (await render.stderr()).slice(-2000),
      stdout: (await render.stdout()).slice(-2000),
    }, { status: 500 });
  }

  const pngBuf = await sandbox.fs.readFile('/tmp/font-probe.png');
  const localPath = `/tmp/font-probe-from-sandbox-${Date.now()}.png`;
  await writeFile(localPath, pngBuf);

  const result = await verifyFingerprint(localPath, expectedFingerprint as FontFingerprint);

  return NextResponse.json({
    pass: result.ok,
    duration_ms: Date.now() - t0,
    mismatches: result.mismatches,
    actual: result.actual,
    expected: (expectedFingerprint as FontFingerprint).hashes,
    png_at: localPath,
    sandbox_name: sandbox.name,
  });
}
