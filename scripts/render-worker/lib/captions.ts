// scripts/render-worker/lib/captions.ts
//
// Convert a flat list of word-level timings into an SRT file optimized for
// vertical-mobile burn-in: ≤3 words per cue, ≤2.0s per cue, gaps preserved.

export interface TimedWord { word: string; start: number; end: number; }

const MAX_WORDS_PER_CUE = 3;
const MAX_CUE_DURATION_SEC = 2.0;

export function wordsToSrt(words: TimedWord[]): string {
  if (words.length === 0) return '';
  const cues: { start: number; end: number; text: string }[] = [];
  let current: TimedWord[] = [];

  const flush = () => {
    if (current.length === 0) return;
    cues.push({
      start: current[0].start,
      end: current[current.length - 1].end,
      text: current.map((w) => w.word.trim()).join(' '),
    });
    current = [];
  };

  for (const w of words) {
    if (current.length === 0) { current.push(w); continue; }
    const span = w.end - current[0].start;
    if (current.length >= MAX_WORDS_PER_CUE || span > MAX_CUE_DURATION_SEC) {
      flush();
    }
    current.push(w);
  }
  flush();

  return cues.map((c, i) => `${i + 1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${c.text.toUpperCase()}\n`).join('\n');
}

function fmt(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  const ms = Math.round((secs - Math.floor(secs)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}
