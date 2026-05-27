// scripts/render-worker/lib/compile-f2.ts
//
// Pure ffmpeg argv builders for the Format-2 (Top-5 compilation) renderer.
// No filesystem IO here — keeps the handler thin and the math testable.
// Phase 4 v1 uses ffmpeg drawtext for the title bar + numbered overlays;
// Remotion title cards + animated callouts land in a follow-up phase after
// the plan-4-phase-2-5 captions-overlay branch merges (see Task 18 in the
// Phase 4 plan).
//
// Font: DejaVu Sans Bold is bundled in ../assets/ because the Vercel Sandbox
// (Amazon Linux 2023) does not ship DejaVu fonts by default and the
// /usr/share/fonts/ paths most ffmpeg drawtext examples assume don't exist.
// fontPath is injected by the caller (the handler resolves it relative to its
// own module path) so the pure builder stays filesystem-free.

export interface F2ClipRef {
  clip_id: string;
  start_sec: number;
  end_sec: number;
  label: string;
  order: number;
}

export interface CompositeArgs {
  concatVideoPath: string;
  musicPath: string;
  refs: F2ClipRef[];
  titleTemplate: string;
  layoutVariant: 'top5_sidebar' | 'top5_overlay';
  outputPath: string;
  fontPath: string;
}

/** Trim a single source clip to [startSec, endSec] and rescale to 1080x1920. */
export function buildTrimArgs(
  clipIn: string,
  clipOut: string,
  startSec: number,
  endSec: number,
): string[] {
  return [
    '-y',
    '-i', clipIn,
    '-ss', String(startSec),
    '-to', String(endSec),
    '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1',
    '-r', '30',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
    '-c:a', 'aac', '-b:a', '128k',
    clipOut,
  ];
}

/** ffmpeg concat-demuxer list file body. One `file 'path'` per line. */
export function buildConcatListFile(clipPaths: string[]): string {
  return clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
}

/**
 * Composite the concatenated video with a top title bar, per-segment numbered
 * label overlays, and ducked background music. layoutVariant changes whether the
 * label is anchored to a sidebar-like left column (top5_sidebar) or floats over
 * the bottom of the frame (top5_overlay).
 */
export function buildCompositeArgs(args: CompositeArgs): string[] {
  const drawTitle = `drawtext=fontfile=${args.fontPath}:text='${escapeDrawtext(
    args.titleTemplate,
  )}':fontcolor=white:fontsize=64:box=1:boxcolor=black@0.7:boxborderw=20:x=(w-text_w)/2:y=40`;

  const sortedRefs = [...args.refs].sort((a, b) => a.order - b.order);
  const labels = sortedRefs
    .map((r, i) => {
      const startTime = sortedRefs
        .slice(0, i)
        .reduce((a, x) => a + (x.end_sec - x.start_sec), 0);
      const segDur = r.end_sec - r.start_sec;
      const labelText = escapeDrawtext(`#${5 - i} ${r.label}`);
      const positioning =
        args.layoutVariant === 'top5_sidebar'
          ? 'x=40:y=h-220'
          : 'x=(w-text_w)/2:y=h-220';
      return `drawtext=fontfile=${args.fontPath}:text='${labelText}':fontcolor=white:fontsize=48:box=1:boxcolor=black@0.6:boxborderw=15:${positioning}:enable='between(t,${startTime.toFixed(3)},${(startTime + segDur).toFixed(3)})'`;
    })
    .join(',');

  const videoFilter = labels.length > 0 ? `${drawTitle},${labels}` : drawTitle;

  return [
    '-y',
    '-i', args.concatVideoPath,
    '-i', args.musicPath,
    '-filter_complex',
    `[0:v]${videoFilter}[v];[1:a]volume=0.20[mb];[0:a][mb]amix=inputs=2:duration=first:dropout_transition=3[a]`,
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '21',
    '-c:a', 'aac', '-b:a', '192k',
    '-r', '30',
    '-shortest',
    args.outputPath,
  ];
}

/** Escape ffmpeg drawtext-special characters. */
export function escapeDrawtext(s: string): string {
  return s.replace(/[\\:%']/g, (c) => `\\${c}`);
}
