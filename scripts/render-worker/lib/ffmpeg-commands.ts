// scripts/render-worker/lib/ffmpeg-commands.ts
//
// Centralized ffmpeg invocations.
// - renderBlackBackgroundWithAudio: Phase 1 black-bg + audio mux (still used by debug paths)
// - normalizeShot / buildNormalizeShotArgs: scale+crop+trim a Pexels clip to 1080x1920 30fps
// - renderColoredBackground: lavfi colored bg when a shot's Pexels search misses
// - writeConcatList: produces an ffmpeg concat-demuxer text file
// - finalCompose / buildFinalComposeArgs: concat normalized shots + mux voice + music@25% + burn captions
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

const SRT_FORCE_STYLE =
  "FontName=Arial,FontSize=72,PrimaryColour=&HFFFFFFFF,OutlineColour=&H00000000," +
  "Outline=4,BorderStyle=1,Alignment=2,MarginV=300,Bold=1";

export function buildFinalComposeArgs(args: {
  concatListPath: string;
  voicePath: string;
  musicPath: string | null;
  subtitlesPath: string | null;
  outputPath: string;
}): string[] {
  const inputs: string[] = [
    '-y',
    '-f', 'concat', '-safe', '0', '-i', args.concatListPath,  // input 0: video concat
    '-i', args.voicePath,                                      // input 1: voice
  ];
  if (args.musicPath) inputs.push('-i', args.musicPath);       // input 2: music (optional)

  // Video filter chain
  let videoFilter = '';
  let videoStream: string;
  if (args.subtitlesPath) {
    videoFilter = `[0:v]subtitles=${args.subtitlesPath}:force_style='${SRT_FORCE_STYLE}'[v]`;
    videoStream = '[v]';
  } else {
    videoStream = '0:v';
  }

  // Audio filter chain
  let audioFilter: string;
  let audioStream: string;
  if (args.musicPath) {
    audioFilter = '[2:a]volume=0.25[m];[1:a][m]amix=inputs=2:duration=first[a]';
    audioStream = '[a]';
  } else {
    audioFilter = '';
    audioStream = '1:a';
  }

  const filterComplex = [videoFilter, audioFilter].filter(Boolean).join(';');

  const argv = [
    ...inputs,
    ...(filterComplex ? ['-filter_complex', filterComplex] : []),
    '-map', videoStream,
    '-map', audioStream,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
    '-c:a', 'aac', '-b:a', '128k',
    '-shortest',
    '-movflags', '+faststart',
    args.outputPath,
  ];
  return argv;
}

export async function finalCompose(args: {
  concatListPath: string;
  voicePath: string;
  musicPath: string | null;
  subtitlesPath: string | null;
  outputPath: string;
}): Promise<void> {
  await runFfmpeg(buildFinalComposeArgs(args));
}

function runFfmpeg(argv: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath as string, argv, { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
}
