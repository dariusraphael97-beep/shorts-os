// scripts/render-worker/lib/ffmpeg-commands.ts
//
// Centralized ffmpeg invocations.
// - renderBlackBackgroundWithAudio: Phase 1 black-bg + audio mux (still used by debug paths)
// - normalizeShot / buildNormalizeShotArgs: scale+crop+trim a Pexels clip to 1080x1920 30fps
// - renderColoredBackground: lavfi colored bg when a shot's Pexels search misses
// - writeConcatList: produces an ffmpeg concat-demuxer text file
// - composeBase / buildBaseComposeArgs: concat normalized shots + mux voice + music@25% (no SRT burn)
// - compositeBaseAndOverlay / buildCompositeArgs: overlay transparent Remotion caption video onto base
// - finalCompose: compat shim → composeBase (subtitlesPath silently ignored; removed in Task 9)
//
// The build* functions return argv arrays (no side effects) so they're unit-testable.
// The runner functions wrap them in spawn().
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

if (!ffmpegPath) throw new Error('ffmpeg-static did not provide a binary path');

export async function renderBlackBackgroundWithAudio(args: {
  audioPath: string;
  durationSeconds: number;
  outputPath: string;
}): Promise<void> {
  const argv = [
    '-y',
    '-f', 'lavfi', '-i', `color=c=black:s=1080x1920:d=${args.durationSeconds}:r=30`,
    '-i', args.audioPath,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-tune', 'stillimage',
    '-c:a', 'aac', '-b:a', '128k', '-shortest',
    '-movflags', '+faststart',
    args.outputPath,
  ];
  await runFfmpeg(argv);
}

export function buildNormalizeShotArgs(args: {
  inputPath: string;
  durationSeconds: number;
  outputPath: string;
}): string[] {
  return [
    '-y',
    '-i', args.inputPath,
    '-t', String(args.durationSeconds),
    '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1',
    '-r', '30',
    '-an',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    args.outputPath,
  ];
}

export async function normalizeShot(args: {
  inputPath: string;
  durationSeconds: number;
  outputPath: string;
}): Promise<void> {
  await runFfmpeg(buildNormalizeShotArgs(args));
}

export async function renderColoredBackground(args: {
  hexColor: string;
  durationSeconds: number;
  outputPath: string;
}): Promise<void> {
  const argv = [
    '-y',
    '-f', 'lavfi', '-i', `color=c=${args.hexColor}:s=1080x1920:d=${args.durationSeconds}:r=30`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
    args.outputPath,
  ];
  await runFfmpeg(argv);
}

export async function writeConcatList(paths: string[], outputPath: string): Promise<void> {
  const body = paths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n';
  await writeFile(outputPath, body);
}

export function buildBaseComposeArgs(args: {
  concatListPath: string;
  voicePath: string;
  musicPath: string | null;
  outputPath: string;
}): string[] {
  const inputs: string[] = [
    '-y',
    '-f', 'concat', '-safe', '0', '-i', args.concatListPath,  // input 0: video concat
    '-i', args.voicePath,                                      // input 1: voice
  ];
  if (args.musicPath) inputs.push('-i', args.musicPath);       // input 2: music (optional)

  let audioFilter: string;
  let audioStream: string;
  if (args.musicPath) {
    audioFilter = '[2:a]volume=0.25[m];[1:a][m]amix=inputs=2:duration=first[a]';
    audioStream = '[a]';
  } else {
    audioFilter = '';
    audioStream = '1:a';
  }

  return [
    ...inputs,
    ...(audioFilter ? ['-filter_complex', audioFilter] : []),
    '-map', '0:v',
    '-map', audioStream,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
    '-c:a', 'aac', '-b:a', '128k',
    '-shortest',
    '-movflags', '+faststart',
    args.outputPath,
  ];
}

export async function composeBase(args: {
  concatListPath: string;
  voicePath: string;
  musicPath: string | null;
  outputPath: string;
}): Promise<void> {
  await runFfmpeg(buildBaseComposeArgs(args));
}

export function buildCompositeArgs(args: {
  basePath: string;
  overlayPath: string;
  outputPath: string;
}): string[] {
  return [
    '-y',
    '-i', args.basePath,
    '-i', args.overlayPath,
    '-filter_complex', '[0:v][1:v]overlay=format=auto[v]',
    '-map', '[v]',
    '-map', '0:a',                    // base audio passes through unchanged
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
    '-c:a', 'copy',                   // re-mux audio without re-encoding
    '-movflags', '+faststart',
    args.outputPath,
  ];
}

export async function compositeBaseAndOverlay(args: {
  basePath: string;
  overlayPath: string;
  outputPath: string;
}): Promise<void> {
  await runFfmpeg(buildCompositeArgs(args));
}

// Keep the existing finalCompose export as a compat shim so render-f1.ts
// keeps building until Task 9 updates the handler. The subtitlesPath arg
// is silently ignored — Phase 2.5 moves captions to the Remotion overlay.
export async function finalCompose(args: {
  concatListPath: string;
  voicePath: string;
  musicPath: string | null;
  subtitlesPath: string | null;       // accepted but ignored
  outputPath: string;
}): Promise<void> {
  void args.subtitlesPath;             // suppress unused-warning
  await composeBase({
    concatListPath: args.concatListPath,
    voicePath: args.voicePath,
    musicPath: args.musicPath,
    outputPath: args.outputPath,
  });
}

export function runFfmpeg(argv: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath as string, argv, { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
}
