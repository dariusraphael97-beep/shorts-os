// scripts/render-worker/lib/compile-f2.ts
//
// Pure ffmpeg argv builders for the Format-2 (Top-5 compilation) renderer.
// No filesystem IO here — keeps the handler thin and the math testable.
//
// Phase 4 v1 does NOT render the title bar or numbered overlays via ffmpeg
// drawtext. Root cause: ffmpeg-static's Linux binary (BtbN b6.1.1) is compiled
// with --enable-libfreetype + --enable-fontconfig but the `drawtext` filter
// itself is not in the static build — confirmed by running
// `strings ffmpeg | grep drawtext` against the linux-x64 binary (0 hits) vs
// the darwin binary (1 hit + "Draw text on top..."). The composite step
// emitted `Filter not found` on the first prod smoke (job 06be61ec).
//
// Title bar + numbered overlays will be added by the Task 18 follow-up phase
// using Remotion compositions (which produce a transparent overlay mp4 that
// ffmpeg can `overlay` onto the base — overlay IS in the static build, as
// the Phase 2.5 captions pipeline uses it).

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
  // Phase 4 v1: just mux ducked background music with the concatenated video.
  // titleTemplate + refs + layoutVariant are kept on the signature so the
  // Task 18 follow-up phase can wire in Remotion-rendered title/label overlays
  // without changing this function's call sites.
  void args.titleTemplate;
  void args.refs;
  void args.layoutVariant;

  return [
    '-y',
    '-i', args.concatVideoPath,
    '-i', args.musicPath,
    '-filter_complex',
    '[1:a]volume=0.20[mb];[0:a][mb]amix=inputs=2:duration=first:dropout_transition=3[a]',
    '-map', '0:v', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '21',
    '-c:a', 'aac', '-b:a', '192k',
    '-r', '30',
    '-shortest',
    args.outputPath,
  ];
}

/**
 * Escape ffmpeg drawtext-special characters. Kept as an export for the Task 18
 * Remotion-based title/label follow-up (which still serializes some props as
 * drawtext-style strings).
 */
export function escapeDrawtext(s: string): string {
  return s.replace(/[\\:%']/g, (c) => `\\${c}`);
}
