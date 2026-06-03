// scripts/render-worker/lib/ffmpeg-longform.ts
// Landscape (1920x1080) longform render helpers. Mirrors the vertical helpers in
// ffmpeg-commands.ts but targets 16:9 and adds Ken-Burns + a subtle music bed.
import { runFfmpeg } from './ffmpeg-commands.ts';
import { buildKenBurnsFilter, type KenBurnsDirection } from './ken-burns.ts';
import { buildConcatList } from './chapters.ts';
import { writeFile } from 'node:fs/promises';

const FPS = 30;

/** Style-consistent 1920x1080 gradient PNG (degraded fallback when image-gen is unavailable). */
export async function renderGradientStill(args: { hexA: string; hexB: string; outputPath: string }): Promise<void> {
  await runFfmpeg([
    '-y', '-f', 'lavfi',
    '-i', `gradients=s=1920x1080:c0=0x${args.hexA}:c1=0x${args.hexB}:x0=0:y0=0:x1=1920:y1=1080`,
    '-frames:v', '1', args.outputPath,
  ]);
}

/** Animate a still into a 1920x1080 H.264 clip with a slow Ken-Burns move (no audio). */
export async function renderKenBurnsClip(args: {
  imagePath: string; durationSeconds: number; direction: KenBurnsDirection; zoom: number; outputPath: string;
}): Promise<void> {
  const filter = buildKenBurnsFilter({ durationSeconds: args.durationSeconds, fps: FPS, direction: args.direction, zoom: args.zoom });
  await runFfmpeg([
    '-y', '-loop', '1', '-i', args.imagePath,
    '-t', args.durationSeconds.toFixed(3),
    '-vf', filter,
    '-r', String(FPS),
    '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
    args.outputPath,
  ]);
}

/** Hold a still as a 1920x1080 H.264 clip with NO movement (zero zoompan jitter). Used for the
 *  stick-figure doodle style, where any Ken-Burns shake is glaring on clean line art. */
export async function renderStaticClip(args: {
  imagePath: string; durationSeconds: number; outputPath: string;
}): Promise<void> {
  await runFfmpeg([
    '-y', '-loop', '1', '-i', args.imagePath,
    '-t', args.durationSeconds.toFixed(3),
    '-vf', 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1',
    '-r', String(FPS),
    '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
    args.outputPath,
  ]);
}

/** Mux a chapter's voiceover onto its (silent) beat-concat video. */
export async function muxChapterAudio(args: { videoPath: string; voicePath: string; outputPath: string }): Promise<void> {
  await runFfmpeg([
    '-y', '-i', args.videoPath, '-i', args.voicePath,
    '-map', '0:v', '-map', '1:a',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest',
    args.outputPath,
  ]);
}

/** Concat chapter clips (each video+VO) into one continuous track. Re-encodes for safe concat. */
export async function concatChapterClips(args: { clipPaths: string[]; listPath: string; outputPath: string }): Promise<void> {
  await writeFile(args.listPath, buildConcatList(args.clipPaths), 'utf8');
  await runFfmpeg([
    '-y', '-f', 'concat', '-safe', '0', '-i', args.listPath,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '160k',
    '-movflags', '+faststart', args.outputPath,
  ]);
}

/** Mux a subtle music bed under the narration (lower than shorts' 0.25; fade in/out). */
export async function muxMusicBed(args: { videoPath: string; musicPath: string; durationSeconds: number; outputPath: string; volume?: number }): Promise<void> {
  const vol = args.volume ?? 0.12;
  const fadeOutStart = Math.max(0, args.durationSeconds - 2);
  await runFfmpeg([
    '-y', '-i', args.videoPath, '-stream_loop', '-1', '-i', args.musicPath,
    '-filter_complex',
    `[1:a]volume=${vol},afade=t=in:st=0:d=2,afade=t=out:st=${fadeOutStart.toFixed(2)}:d=2[m];[0:a][m]amix=inputs=2:duration=first[a]`,
    '-map', '0:v', '-map', '[a]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart',
    args.outputPath,
  ]);
}
