// Mirror of src/lib/longform/tts-chunks.ts (+ splitIntoSentences from beats.ts, inlined) —
// worker cannot import src/*. Keep in sync.

const SENTENCE_RE = /[^.!?]+[.!?]+(?:["'"')\]]+)?|\S[^.!?]*$/g;

export function splitIntoSentences(text: string): string[] {
  const matches = text.match(SENTENCE_RE);
  if (!matches) return [];
  return matches.map((s) => s.trim()).filter((s) => s.length > 0);
}

export function planTtsChunks(text: string, maxChars: number): string[] {
  const sentences = splitIntoSentences(text);
  const chunks: string[] = [];
  let current = "";
  for (const s of sentences) {
    if (current === "") current = s;
    else if (current.length + 1 + s.length <= maxChars) current = `${current} ${s}`;
    else { chunks.push(current); current = s; }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function cumulativeOffsets(durations: number[]): number[] {
  const offsets: number[] = [];
  let acc = 0;
  for (const d of durations) { offsets.push(acc); acc += d; }
  return offsets;
}
