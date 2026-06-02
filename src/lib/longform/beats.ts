// src/lib/longform/beats.ts
// Pure narration → ordered image-beats. A beat is one image's worth of narration
// (~targetBeatSeconds). Splits only at sentence boundaries so an image never
// changes mid-sentence. Mirrored into the worker is NOT needed (worker reads stored beats).

export interface BeatSlice {
  text: string;
  estDurationSeconds: number;
}

export interface SplitOptions {
  targetBeatSeconds: number;
  wordsPerSecond: number;
}

const SENTENCE_RE = /[^.!?]+[.!?]+(?:["'"')\]]+)?|\S[^.!?]*$/g;

export function splitIntoSentences(text: string): string[] {
  const matches = text.match(SENTENCE_RE);
  if (!matches) return [];
  return matches.map((s) => s.trim()).filter((s) => s.length > 0);
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function splitNarrationIntoBeats(narration: string, opts: SplitOptions): BeatSlice[] {
  const { targetBeatSeconds, wordsPerSecond } = opts;
  const targetWords = Math.max(1, targetBeatSeconds * wordsPerSecond);
  const sentences = splitIntoSentences(narration);

  const beats: BeatSlice[] = [];
  let bucket: string[] = [];
  let bucketWords = 0;

  const flush = () => {
    if (bucket.length === 0) return;
    const text = bucket.join(" ");
    beats.push({ text, estDurationSeconds: wordCount(text) / wordsPerSecond });
    bucket = [];
    bucketWords = 0;
  };

  for (const sentence of sentences) {
    const w = wordCount(sentence);
    // If adding this sentence overshoots the target and the bucket already has content, close the beat first.
    if (bucketWords > 0 && bucketWords + w > targetWords) flush();
    bucket.push(sentence);
    bucketWords += w;
    // A single oversized sentence becomes its own beat.
    if (bucketWords >= targetWords) flush();
  }
  flush();
  return beats;
}
