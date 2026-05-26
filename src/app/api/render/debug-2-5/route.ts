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

  // Probe what system tools are available and install Chromium deps.
  // The Sandbox node24 runtime does not have apt-get; use the Remotion
  // browser-ensure + npx @puppeteer/browsers approach via a shell probe.
  const sysProbe = await sandbox.runCommand({
    cmd: 'sh',
    args: ['-c', [
      'echo "OS:$(cat /etc/os-release 2>/dev/null | head -3)"',
      'which apt-get 2>/dev/null && echo "HAS_APT=yes" || echo "HAS_APT=no"',
      'which apk 2>/dev/null && echo "HAS_APK=yes" || echo "HAS_APK=no"',
      'which yum 2>/dev/null && echo "HAS_YUM=yes" || echo "HAS_YUM=no"',
      'ls /lib/x86_64-linux-gnu/libnspr4.so 2>/dev/null && echo "HAS_NSPR=yes" || echo "HAS_NSPR=no"',
      'ls /usr/lib/x86_64-linux-gnu/libnspr4.so 2>/dev/null && echo "HAS_NSPR2=yes" || echo "HAS_NSPR2=no"',
      'find / -name "libnspr4.so" 2>/dev/null | head -3',
    ].join('; '),
    ],
  });
  const sysInfo = await sysProbe.stdout();
  // Return diagnostic info so we can understand the environment
  if (!sysInfo.includes('HAS_NSPR=yes') && !sysInfo.includes('HAS_NSPR2=yes')) {
    // Try installing Chromium deps via the available package manager
    let installOk = false;
    if (sysInfo.includes('HAS_APT=yes')) {
      const upd = await sandbox.runCommand({ cmd: 'apt-get', args: ['update', '-qq'], sudo: true, env: { DEBIAN_FRONTEND: 'noninteractive' } });
      const ins = await sandbox.runCommand({ cmd: 'apt-get', args: ['install', '-y', '--no-install-recommends', 'libnspr4', 'libnss3', 'libatk1.0-0', 'libatk-bridge2.0-0', 'libcups2', 'libdrm2', 'libxkbcommon0', 'libxcomposite1', 'libxdamage1', 'libxfixes3', 'libxrandr2', 'libgbm1', 'libasound2', 'libpango-1.0-0', 'libpangocairo-1.0-0'], sudo: true, env: { DEBIAN_FRONTEND: 'noninteractive' } });
      installOk = ins.exitCode === 0;
      if (!installOk) {
        return NextResponse.json({ stage: 'apt_install', exit: ins.exitCode, sysInfo, stderr: (await ins.stderr()).slice(-2000) }, { status: 500 });
      }
    } else {
      // No apt-get: return diagnostic info to inform next iteration
      return NextResponse.json({
        stage: 'sys_probe',
        sysInfo,
        error: 'No package manager found for Chromium deps installation',
      }, { status: 500 });
    }
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
