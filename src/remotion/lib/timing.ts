// src/remotion/lib/timing.ts
//
// Convert Whisper word timings (seconds) to Remotion frame numbers.

export interface TimedWord { word: string; start: number; end: number; }
export interface FramedWord { word: string; startFrame: number; endFrame: number; }

export function wordsToFrames(words: TimedWord[], fps: number, speedMultiplier = 1): FramedWord[] {
  return words.map((w) => ({
    word: w.word.trim(),
    startFrame: Math.round((w.start / speedMultiplier) * fps),
    endFrame: Math.round((w.end / speedMultiplier) * fps),
  }));
}

export function isFirstNoun(word: string, _index: number, _allWords: string[]): boolean {
  // Heuristic: emphasizable if 4+ letters and not a common stopword.
  // Used by the composition to pick the accent word in each cue when
  // accent_word_policy = 'first-noun'.
  const stopwords = new Set(['this', 'that', 'with', 'from', 'have', 'will', 'what', 'when', 'where', 'about', 'their', 'they', 'them', 'there', 'these', 'those', 'into', 'over', 'than', 'just']);
  return word.length >= 4 && !stopwords.has(word.toLowerCase());
}
