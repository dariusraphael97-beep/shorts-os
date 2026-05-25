// scripts/render-worker/lib/ffmpeg-commands.ts
//
// Centralized ffmpeg invocations. Phase 1 has just one: render a 1080x1920 black
// background with an audio track muxed in. Phase 2 extends with shot concat,
// caption burn-in, music duck. Phase 4 extends with compilation template.
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'node:child_process';

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

function runFfmpeg(argv: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath as string, argv, { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  });
}
