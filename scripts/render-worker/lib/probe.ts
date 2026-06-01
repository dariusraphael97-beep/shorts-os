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

/**
 * Probe the first video stream's geometry + frame rate. Best-effort: returns
 * null on any failure (binary missing, no video stream, parse miss) rather
 * than throwing, so the review handler can degrade the `visual` component.
 *
 * avg_frame_rate comes back as a rational like "30/1" or "30000/1001";
 * we divide to a float.
 */
export function probeVideoStream(
  filePath: string,
): Promise<{ width: number; height: number; fps: number } | null> {
  return new Promise((resolve) => {
    const argv = [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,avg_frame_rate',
      '-of', 'default=noprint_wrappers=1:nokey=0',
      filePath,
    ];
    const p = spawn(ffprobePath, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', () => resolve(null));
    p.on('close', (code) => {
      if (code !== 0) return resolve(null);
      try {
        const fields: Record<string, string> = {};
        for (const line of out.split('\n')) {
          const eq = line.indexOf('=');
          if (eq > 0) fields[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
        }
        const width = Number(fields.width);
        const height = Number(fields.height);
        const rate = fields.avg_frame_rate ?? '';
        const [numStr, denStr] = rate.split('/');
        const num = Number(numStr);
        const den = denStr === undefined ? 1 : Number(denStr);
        const fps = den > 0 && Number.isFinite(num) ? num / den : NaN;
        if (!Number.isFinite(width) || width <= 0) return resolve(null);
        if (!Number.isFinite(height) || height <= 0) return resolve(null);
        if (!Number.isFinite(fps) || fps <= 0) return resolve(null);
        resolve({ width, height, fps });
      } catch {
        resolve(null);
      }
    });
  });
}
