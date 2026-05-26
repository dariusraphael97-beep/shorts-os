// scripts/render-worker/lib/probe.ts
//
// Thin wrapper around the ffprobe binary that ships with ffmpeg-static.
// Returns the media duration in seconds as a float.
import { existsSync } from 'node:fs';
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';

const ffprobePath = (() => {
  if (!ffmpegPath) throw new Error('ffmpeg-static did not provide a binary path');
  // ffmpeg-static colocates ffprobe in the same directory on Linux x64.
  return join(dirname(ffmpegPath), 'ffprobe');
})();

if (!existsSync(ffprobePath)) {
  throw new Error(`ffprobe not found at ${ffprobePath}; ffmpeg-static may need an alternate package on this platform`);
}

export function probeDurationSeconds(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const argv = ['-v', 'error', '-show_entries', 'format=duration',
                  '-of', 'default=noprint_wrappers=1:nokey=1', filePath];
    const p = spawn(ffprobePath, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffprobe exited ${code}: ${err}`));
      const n = parseFloat(out.trim());
      if (!Number.isFinite(n)) return reject(new Error(`ffprobe returned non-numeric: "${out}"`));
      resolve(n);
    });
  });
}
