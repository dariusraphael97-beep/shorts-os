// scripts/render-worker/lib/remotion.ts
//
// Worker-side wrapper around `npx remotion render`. Returns the argv array
// from a pure builder (testable) and exposes `renderRemotionOverlay()` that
// spawns the CLI with timeout + stderr capture.

import { spawn } from 'node:child_process';

export interface RemotionRenderArgs {
  compositionId: string;
  props: Record<string, unknown>;
  outputPath: string;
  durationInFrames: number;
}

export function buildRemotionRenderArgs(args: RemotionRenderArgs): string[] {
  return [
    'remotion',
    'render',
    '/vercel/sandbox/src/remotion/index.tsx',
    args.compositionId,
    args.outputPath,
    '--codec=prores',
    '--prores-profile=4444',
    '--pixel-format=yuva444p10le',
    `--frames=0-${args.durationInFrames - 1}`,
    `--props=${JSON.stringify(args.props)}`,
    '--log=warn',
  ];
}

export interface RenderResult { stdout: string; stderr: string; exitCode: number; }

export function renderRemotionOverlay(args: RemotionRenderArgs): Promise<RenderResult> {
  const argv = buildRemotionRenderArgs(args);
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', argv, {
      // cwd MUST be the worker package dir so npx finds node_modules/.bin/remotion.
      // Same class of bug as Phase 1 lesson #6 (`node --import tsx run.ts` needed
      // this cwd to resolve tsx). The first smoke render fell back to base.mp4
      // because `cwd: '/vercel/sandbox'` had no node_modules with remotion in it.
      cwd: '/vercel/sandbox/scripts/render-worker',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 180_000,                 // 180s ceiling on the Remotion step
    });
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => { out += d; });
    proc.stderr.on('data', (d) => { err += d; });
    proc.on('error', reject);
    proc.on('close', (code) => {
      resolve({ stdout: out, stderr: err, exitCode: code ?? -1 });
    });
  });
}
