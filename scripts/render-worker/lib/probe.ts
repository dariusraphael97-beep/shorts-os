// scripts/render-worker/lib/probe.ts
//
// Thin wrapper around the ffprobe binary. ffmpeg-static ships only ffmpeg,
// not ffprobe — they're separate npm packages. Uses @ffprobe-installer/ffprobe
// for the binary.
import { spawn } from 'node:child_process';
import ffprobePkg from '@ffprobe-installer/ffprobe';

const ffprobePath = ffprobePkg.path;
if (!ffprobePath) throw new Error('@ffprobe-installer/ffprobe did not provide a binary path');

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
