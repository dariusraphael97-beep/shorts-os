// src/lib/longform/beats.ts
// Pure narration → ordered image-beats. A beat is one image's worth of narration
// (~targetBeatSeconds). To keep an EVEN ~2-3s cadence (Zenn style), long sentences are
// split at clause boundaries (commas/semicolons/colons/dashes) and, if a clause is still
// too long, hard-split at word boundaries; the atoms are then packed up to the target size
// and any tiny fragment is merged into a neighbour. The result is always a CONTIGUOUS
// partition of the narration (same word sequence), which the worker relies on to align each
// beat to real per-word TTS timestamps. Mirrored into the worker is NOT needed (worker reads stored beats).

export interface BeatSlice {
  text: string;
  estDurationSeconds: number;
}

export interface SplitOptions {
  targetBeatSeconds: number;
  wordsPerSecond: number;
}

const SENTENCE_RE = /[^.!?]+[.!?]+(?:["'"')\]]+)?|\S[^.!?]*$/g;
// Split after a clause delimiter that is followed by whitespace (delimiter stays on the left part).
const CLAUSE_SPLIT_RE = /(?<=[,;:—–])\s+/;

export function splitIntoSentences(text: string): string[] {
  const matches = text.match(SENTENCE_RE);
  if (!matches) return [];
  return matches.map((s) => s.trim()).filter((s) => s.length > 0);
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// Split a run of text into ~maxWords word-chunks at word boundaries (last resort for a long
// clause with no internal punctuation).
function hardSplitWords(text: string, maxWords: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i += maxWords) {
    out.push(words.slice(i, i + maxWords).join(" "));
  }
  return out;
}

// Atomic units: sentences, further broken at clause delimiters / word boundaries when too long.
function atomize(narration: string, maxWords: number): string[] {
  const atoms: string[] = [];
  for (const sentence of splitIntoSentences(narration)) {
    if (wordCount(sentence) <= maxWords) {
      atoms.push(sentence);
      continue;
    }
    for (const clause of sentence.split(CLAUSE_SPLIT_RE)) {
      const c = clause.trim();
      if (!c) continue;
      if (wordCount(c) <= maxWords) atoms.push(c);
      else atoms.push(...hardSplitWords(c, maxWords));
    }
  }
  return atoms;
}

// Merge any beat below minWords into a neighbour so no image flashes too briefly.
function mergeTiny(beats: string[], minWords: number): string[] {
  if (beats.length <= 1) return beats;
  const out: string[] = [];
  for (const b of beats) {
    if (out.length > 0 && wordCount(b) < minWords) {
      out[out.length - 1] = `${out[out.length - 1]} ${b}`;
    } else {
      out.push(b);
    }
  }
  // A tiny FIRST beat couldn't merge backwards above — fold it into the second.
  if (out.length > 1 && wordCount(out[0]) < minWords) {
    out[1] = `${out[0]} ${out[1]}`;
    out.shift();
  }
  return out;
}

export function splitNarrationIntoBeats(narration: string, opts: SplitOptions): BeatSlice[] {
  const { targetBeatSeconds, wordsPerSecond } = opts;
  const targetWords = Math.max(1, Math.round(targetBeatSeconds * wordsPerSecond));
  const maxWords = Math.max(targetWords + 1, Math.round(targetWords * 1.6));
  const minWords = Math.max(1, Math.floor(targetWords * 0.45));

  const atoms = atomize(narration, maxWords);
  const packed: string[] = [];
  let bucket: string[] = [];
  let bucketWords = 0;
  const flush = () => {
    if (bucket.length === 0) return;
    packed.push(bucket.join(" "));
    bucket = [];
    bucketWords = 0;
  };
  for (const atom of atoms) {
    const w = wordCount(atom);
    if (bucketWords > 0 && bucketWords + w > targetWords) flush();
    bucket.push(atom);
    bucketWords += w;
    if (bucketWords >= targetWords) flush();
  }
  flush();

  return mergeTiny(packed, minWords).map((text) => ({
    text,
    estDurationSeconds: wordCount(text) / wordsPerSecond,
  }));
}
