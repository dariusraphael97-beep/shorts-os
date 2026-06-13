// scripts/render-worker/lib/cartesia-longform.ts
// TTS chapter synthesis (Cartesia OR ElevenLabs, by plan.voice.provider). Chunks long narration
// at sentence boundaries, synthesizes each chunk, concatenates the WAVs, and returns per-word
// timestamps (offset across chunks) so the handler can sync each image to when its words are spoken.
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { synthesizeToWav as cartesiaSynth, type WordTime } from './cartesia.ts';
import { synthesizeToWav as elevenSynth } from './elevenlabs.ts';
import { runFfmpeg } from './ffmpeg-commands.ts';
import { probeDurationSeconds } from './probe.ts';
import { planTtsChunks } from './tts-chunks.ts';
import { stitchChunkWordTimes, type ChunkWordTimes } from './beat-timing.ts';

const MAX_CHUNK_CHARS = 1200; // bounds retries + memory; both providers handle far longer.

// Map the plan's numeric narration speed to Cartesia's pace enum (ElevenLabs takes the number directly).
function cartesiaSpeed(n: number): string {
  if (n <= 0.93) return 'slow';
  if (n >= 1.07) return 'fast';
  return 'normal';
}

export async function synthesizeChapterToWav(args: {
  narration: string; voiceId: string; workDir: string; chapterIndex: number;
  provider?: string; speed?: number;
}): Promise<{ wavPath: string; durationSeconds: number; words: WordTime[] }> {
  const isEleven = args.provider === 'elevenlabs';
  const synthChunk = (script: string, outputPath: string) =>
    isEleven
      ? elevenSynth({ script, voiceId: args.voiceId, outputPath, speed: args.speed })
      : cartesiaSynth({ script, voiceId: args.voiceId, outputPath, speed: args.speed != null ? cartesiaSpeed(args.speed) : undefined });

  const chunks = planTtsChunks(args.narration, MAX_CHUNK_CHARS);
  const chunkPaths: string[] = [];
  // Collect each chunk's words alongside its REAL decoded-WAV duration. Word times are stitched into
  // an absolute timeline AFTER the loop using those real durations — never the alignment's last-word
  // end time, which omits trailing silence + transcode padding and would drift images ahead of the
  // voice across a multi-chunk chapter (see stitchChunkWordTimes).
  const perChunk: ChunkWordTimes[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const out = join(args.workDir, `ch${args.chapterIndex}_chunk${i}.wav`);
    // Per-chunk retry: one bounded retry so a transient failure fails only its chunk.
    let r: { durationSeconds: number; words: WordTime[] };
    try {
      r = await synthChunk(chunks[i], out);
    } catch {
      r = await synthChunk(chunks[i], out);
    }
    const realDurationSeconds = await probeDurationSeconds(out);
    perChunk.push({ words: r.words, realDurationSeconds });
    chunkPaths.push(out);
  }
  const words = stitchChunkWordTimes(perChunk);
  const wavPath = join(args.workDir, `ch${args.chapterIndex}_vo.wav`);
  if (chunkPaths.length === 1) {
    return { wavPath: chunkPaths[0], durationSeconds: perChunk[0].realDurationSeconds, words };
  }
  const listPath = join(args.workDir, `ch${args.chapterIndex}_vo_list.txt`);
  await writeFile(listPath, chunkPaths.map((p) => `file '${p}'`).join('\n') + '\n', 'utf8');
  await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', wavPath]);
  const durationSeconds = await probeDurationSeconds(wavPath);
  return { wavPath, durationSeconds, words };
}
