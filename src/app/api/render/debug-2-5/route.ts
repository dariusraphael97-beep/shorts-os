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

  // Vercel Sandbox is Amazon Linux 2023 (yum-based). Install Chromium
  // system libs required by Remotion's bundled Chromium (libnspr4 et al).
  // The Sandbox SDK runCommand supports `sudo: true` for privileged ops.
  const tDeps = Date.now();
  const yumInstall = await sandbox.runCommand({
    cmd: 'yum',
    args: ['install', '-y', '-q',
      'nspr', 'nss', 'atk', 'at-spi2-atk', 'cups-libs', 'libdrm', 'libxkbcommon',
      'libXcomposite', 'libXdamage', 'libXfixes', 'libXrandr', 'mesa-libgbm',
      'alsa-lib', 'pango', 'cairo', 'libxshmfence',
    ],
    sudo: true,
  });
  if (yumInstall.exitCode !== 0) {
    return NextResponse.json({
      stage: 'yum_install',
      exit: yumInstall.exitCode,
      duration_ms: Date.now() - tDeps,
      stderr: (await yumInstall.stderr()).slice(-2000),
      stdout: (await yumInstall.stdout()).slice(-2000),
    }, { status: 500 });
  }
  const yumInstallMs = Date.now() - tDeps;

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
    yum_install_ms: yumInstallMs,
    mismatches: result.mismatches,
    actual: result.actual,
    expected: (expectedFingerprint as FontFingerprint).hashes,
    png_at: localPath,
    sandbox_name: sandbox.name,
  });
}
