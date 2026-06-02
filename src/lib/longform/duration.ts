// src/lib/longform/duration.ts
// Pure math for turning a target video length into a chapter count + word budget.
// Mirrored into scripts/render-worker is NOT needed (worker reads stored counts).

/** Effective narration rate incl. the deliberate suspense gaps in the reference format (~2 wps spoken). */
export const WORDS_PER_SECOND = 2.4;

export const MIN_DURATION_SECONDS = 180;
export const MAX_DURATION_SECONDS = 1200;
const SECONDS_PER_CHAPTER = 100;
const MIN_CHAPTERS = 3;
const MAX_CHAPTERS = 12;

export function clampTargetDuration(seconds: number): number {
  if (!Number.isFinite(seconds)) return MIN_DURATION_SECONDS;
  return Math.min(MAX_DURATION_SECONDS, Math.max(MIN_DURATION_SECONDS, Math.round(seconds)));
}

export function deriveChapterCount(targetDurationSeconds: number): number {
  const clamped = clampTargetDuration(targetDurationSeconds);
  const raw = Math.round(clamped / SECONDS_PER_CHAPTER);
  return Math.min(MAX_CHAPTERS, Math.max(MIN_CHAPTERS, raw));
}

export function estimateWordBudget(targetDurationSeconds: number): number {
  return Math.round(clampTargetDuration(targetDurationSeconds) * WORDS_PER_SECOND);
}

export function estimateNarrationSeconds(wordCount: number): number {
  return wordCount / WORDS_PER_SECOND;
}
