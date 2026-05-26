// scripts/render-worker/lib/frames.ts
//
// Extracts JPG frames + a single thumbnail from a local mp4. Frame budget
// per spec §3 clip_ingest: 0.5 fps if duration <=30s, 0.25 fps for 30-120s,
// hard cap at 60 frames.
import ffmpegStatic from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';

function ffmpegBin(): string {
  if (!ffmpegStatic) throw new Error('ffmpeg-static binary path not available');
  return ffmpegStatic;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const cp = spawn(ffmpegBin(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    cp.stderr.on('data', (b) => { stderr += b.toString(); });
    cp.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`)),
    );
  });
}

export interface ExtractFramesArgs {
  videoPath: string;
  durationSeconds: number;
  outDir: string;
}

export interface ExtractFramesResult {
  framePaths: string[];
  thumbnailPath: string;
}

export async function extractFramesAndThumbnail(
  args: ExtractFramesArgs,
): Promise<ExtractFramesResult> {
  await mkdir(args.outDir, { recursive: true });

  const fps = args.durationSeconds <= 30 ? 0.5 : 0.25;
  const cap = 60;
  await runFfmpeg([
    '-y',
    '-i', args.videoPath,
    '-vf', `fps=${fps},scale=512:-2`,
    '-frames:v', String(cap),
    '-q:v', '3',
    join(args.outDir, 'frame_%04d.jpg'),
  ]);

  const thumbnailPath = join(args.outDir, 'thumbnail.jpg');
  await runFfmpeg([
    '-y',
    '-ss', '1',
    '-i', args.videoPath,
    '-frames:v', '1',
    '-vf', 'scale=480:-2',
    '-q:v', '4',
    thumbnailPath,
  ]);

  const entries = await readdir(args.outDir);
  const framePaths = entries
    .filter((n) => /^frame_\d+\.jpg$/.test(n))
    .sort()
    .map((n) => join(args.outDir, n));

  return { framePaths, thumbnailPath };
}
