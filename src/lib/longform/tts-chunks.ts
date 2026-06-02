// src/lib/longform/tts-chunks.ts
// Pure helpers for chunked Cartesia synthesis of long chapter narration:
// split at sentence boundaries under a char cap, then line up cumulative offsets
// after each chunk's WAV is probed. Mirrored verbatim into the worker.

import { splitIntoSentences } from "@/lib/longform/beats";

export function planTtsChunks(text: string, maxChars: number): string[] {
  const sentences = splitIntoSentences(text);
  const chunks: string[] = [];
  let current = "";
  for (const s of sentences) {
    if (current === "") {
      current = s;
    } else if (current.length + 1 + s.length <= maxChars) {
      current = `${current} ${s}`;
    } else {
      chunks.push(current);
      current = s;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Start time (seconds) of each chunk given its measured duration. */
export function cumulativeOffsets(durations: number[]): number[] {
  const offsets: number[] = [];
  let acc = 0;
  for (const d of durations) {
    offsets.push(acc);
    acc += d;
  }
  return offsets;
}
