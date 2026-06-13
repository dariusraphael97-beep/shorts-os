// scripts/render-worker/lib/beat-timing.ts (MIRROR — keep in sync with src)
// Pure mapping of consecutive beats (by their word counts) onto real per-word start times
// from the TTS provider's word timestamps → exact per-beat display durations, so each image
// appears exactly when its words are spoken (vs. the old proportional estimate).
// Mirrored verbatim into scripts/render-worker/lib/beat-timing.ts (worker cannot import src/*).

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export interface WordTime { word: string; start: number; end: number }

export interface ChunkWordTimes { words: WordTime[]; realDurationSeconds: number }

/**
 * Stitch per-chunk word timestamps into one absolute timeline. Each chunk's words are shifted by
 * the sum of PRIOR chunks' REAL decoded-audio durations — NOT by the TTS alignment's last-word-end
 * time. The alignment omits each chunk's trailing silence (~0.3s) plus any mp3→wav transcode
 * padding, so using it as the offset makes every later chunk's words land progressively early; the
 * images then drift ahead of the voice through the chapter and only resync at the next chapter
 * boundary. Only long chapters (split into multiple chunks) are affected. Always pass the probed
 * WAV duration as realDurationSeconds.
 */
export function stitchChunkWordTimes(chunks: ChunkWordTimes[]): WordTime[] {
  const out: WordTime[] = [];
  let offset = 0;
  for (const c of chunks) {
    for (const w of c.words) out.push({ word: w.word, start: w.start + offset, end: w.end + offset });
    offset += c.realDurationSeconds;
  }
  return out;
}

/**
 * Convert ElevenLabs character-level alignment into word-level timestamps. A word ends at each
 * run of whitespace; its start = the first char's start time, end = the last char's end time.
 */
export function wordsFromCharAlignment(chars: string[], starts: number[], ends: number[]): WordTime[] {
  const words: WordTime[] = [];
  let cur = "";
  let curStart = -1;
  let curEnd = 0;
  const flush = () => {
    if (cur.trim()) words.push({ word: cur, start: curStart < 0 ? 0 : curStart, end: curEnd });
    cur = "";
    curStart = -1;
    curEnd = 0;
  };
  for (let i = 0; i < chars.length; i++) {
    if (/\s/.test(chars[i])) { flush(); continue; }
    if (curStart < 0) curStart = starts[i] ?? 0;
    cur += chars[i];
    curEnd = ends[i] ?? curEnd;
  }
  flush();
  return words;
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
