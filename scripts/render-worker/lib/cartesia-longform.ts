// scripts/render-worker/lib/cartesia-longform.ts
// Synthesize long chapter narration by chunking at sentence boundaries, synthesizing each
// chunk, and concatenating the WAVs. Reuses the single-shot synthesizeToWav primitive.
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { synthesizeToWav } from './cartesia.ts';
import { runFfmpeg } from './ffmpeg-commands.ts';
import { probeDurationSeconds } from './probe.ts';
import { planTtsChunks } from './tts-chunks.ts';

const MAX_CHUNK_CHARS = 1200; // Cartesia handles long text, but chunking bounds retries + memory.

export async function synthesizeChapterToWav(args: {
  narration: string; voiceId: string; workDir: string; chapterIndex: number;
}): Promise<{ wavPath: string; durationSeconds: number }> {
  const chunks = planTtsChunks(args.narration, MAX_CHUNK_CHARS);
  const chunkPaths: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const out = join(args.workDir, `ch${args.chapterIndex}_chunk${i}.wav`);
    // Per-chunk retry: one bounded retry so a transient failure fails only its chunk.
    try {
      await synthesizeToWav({ script: chunks[i], voiceId: args.voiceId, outputPath: out });
    } catch {
      await synthesizeToWav({ script: chunks[i], voiceId: args.voiceId, outputPath: out });
    }
    chunkPaths.push(out);
  }
  const wavPath = join(args.workDir, `ch${args.chapterIndex}_vo.wav`);
  if (chunkPaths.length === 1) {
    // Single chunk: just re-point.
    const dur = await probeDurationSeconds(chunkPaths[0]);
    return { wavPath: chunkPaths[0], durationSeconds: dur };
  }
  const listPath = join(args.workDir, `ch${args.chapterIndex}_vo_list.txt`);
  await writeFile(listPath, chunkPaths.map((p) => `file '${p}'`).join('\n') + '\n', 'utf8');
  await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', wavPath]);
  const durationSeconds = await probeDurationSeconds(wavPath);
  return { wavPath, durationSeconds };
}
