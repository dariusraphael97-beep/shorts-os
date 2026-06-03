// scripts/render-worker/lib/beat-timing.ts (MIRROR — keep in sync with src)
// Pure mapping of consecutive beats (by their word counts) onto real per-word start times
// from the TTS provider's word timestamps → exact per-beat display durations, so each image
// appears exactly when its words are spoken (vs. the old proportional estimate).
// Mirrored verbatim into scripts/render-worker/lib/beat-timing.ts (worker cannot import src/*).

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * @param beatWordCounts word count of each beat's narration slice, in order
 * @param wordStarts     start time (s) of every spoken word, in order
 * @param totalDurationSeconds total audio duration (the last beat runs to here)
 * @returns per-beat display duration in seconds (clamped to minBeatSeconds)
 */
export function beatDurationsFromWordStarts(
  beatWordCounts: number[],
  wordStarts: number[],
  totalDurationSeconds: number,
  minBeatSeconds = 0.4,
): number[] {
  const starts: number[] = [];
  let idx = 0;
  for (const c of beatWordCounts) {
    starts.push(idx < wordStarts.length ? wordStarts[idx] : totalDurationSeconds);
    idx += Math.max(0, c);
  }
  return starts.map((s, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] : totalDurationSeconds;
    return Math.max(minBeatSeconds, end - s);
  });
}
