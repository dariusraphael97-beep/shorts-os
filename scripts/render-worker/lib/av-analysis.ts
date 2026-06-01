// scripts/render-worker/lib/av-analysis.ts
//
// Best-effort audio/video heuristic probes for the review handler. Both run
// ffmpeg analysis filters and parse stats off stderr. They are intentionally
// NON-THROWING — any failure (missing binary, decode error, parse miss)
// resolves to null so the review handler degrades the affected component to a
// low-confidence `needs_work` rather than failing the whole job.
import ffmpegStatic from 'ffmpeg-static';
import { spawn } from 'node:child_process';

function ffmpegBin(): string | null {
  return ffmpegStatic ?? null;
}

/**
 * Run ffmpeg with the given argv and resolve the captured stderr (ffmpeg writes
 * its analysis/stats to stderr). Resolves null if the binary is missing, the
 * process errors, or exits non-zero.
 */
function runFfmpegCaptureStderr(argv: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const bin = ffmpegBin();
    if (!bin) return resolve(null);
    const cp = spawn(bin, argv, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    cp.stderr.on('data', (b) => { stderr += b.toString(); });
    cp.on('error', () => resolve(null));
    cp.on('close', (code) => {
      // ffmpeg returns 0 after a successful analyze-to-null pass. Some filters
      // still produce usable stats on a non-zero exit, but we keep it strict
      // and only trust a clean exit.
      if (code !== 0) return resolve(null);
      resolve(stderr);
    });
  });
}

/**
 * Count scene changes via the `select='gt(scene,0.4)',showinfo` filter, which
 * emits one `showinfo` line per detected scene-change frame. Returns the count,
 * or null on failure. A return of 0 means "ran fine, found no cuts".
 */
export async function detectSceneCount(filePath: string): Promise<number | null> {
  const stderr = await runFfmpegCaptureStderr([
    '-hide_banner',
    '-i', filePath,
    '-an',
    '-vf', "select='gt(scene,0.4)',showinfo",
    '-f', 'null',
    '-',
  ]);
  if (stderr === null) return null;
  // showinfo prints "[Parsed_showinfo_... @ ...] n:   0 pts: ..." once per
  // selected (scene-change) frame.
  const matches = stderr.match(/Parsed_showinfo_\d+ @ [^\]]*\] n:\s*\d+/g);
  if (!matches) {
    // Filter ran but emitted nothing — treat as zero cuts, not a failure.
    if (/showinfo/.test(stderr)) return 0;
    return null;
  }
  return matches.length;
}

/**
 * Measure integrated loudness (LUFS) via the EBU R128 filter. ffmpeg's
 * `ebur128` summary block prints e.g. "    I:         -14.0 LUFS". Returns the
 * integrated value, or null on failure.
 */
export async function measureLoudness(
  filePath: string,
): Promise<{ integratedLufs: number } | null> {
  const stderr = await runFfmpegCaptureStderr([
    '-hide_banner',
    '-i', filePath,
    '-vn',
    '-af', 'ebur128=framelog=verbose',
    '-f', 'null',
    '-',
  ]);
  if (stderr === null) return null;
  // The final "Summary:" block contains a line like "  I:   -14.0 LUFS".
  // Grab the LAST integrated-loudness match (the summary value).
  const all = [...stderr.matchAll(/\bI:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g)];
  if (all.length === 0) return null;
  const last = all[all.length - 1];
  const integratedLufs = Number(last[1]);
  if (!Number.isFinite(integratedLufs)) return null;
  return { integratedLufs };
}
