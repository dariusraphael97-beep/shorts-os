/**
 * Pure deterministic review scoring helpers.
 *
 * No I/O, no LLM, no randomness, no Date calls.
 * LLM/vision components (title, thumbnail, pacing, audio, visual) live in the
 * worker as edges; they are intentionally absent here.
 *
 * Shared types are defined here so the worker can reuse them (structurally
 * identical to the DB row shapes).
 */
import type { ReviewVerdict } from '@/lib/agents/review/verdict';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface ReviewSuggestion {
  component: string;
  severity: ReviewVerdict;
  suggestion_text: string;
}

export interface ReviewStrength {
  component: string;
  what_works_text: string;
}

export interface ComponentScore {
  /** Normalised 0–1 quality score. */
  score: number;
  verdict: ReviewVerdict;
  suggestions: ReviewSuggestion[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Clamp a number to [0, 1]. */
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Derive a three-band verdict from a 0–1 score. */
function verdictFromScore(score: number): ReviewVerdict {
  if (score >= 0.7) return 'pass';
  if (score >= 0.35) return 'needs_work';
  return 'fail';
}

// ---------------------------------------------------------------------------
// scoreDescriptionSeo
// ---------------------------------------------------------------------------
//
// Scoring formula (two equally-weighted halves → average → 0–1):
//
//   keywordRatio  = (keywords found in desc) / max(keywords.length, 1)
//                   → full credit when all keywords present; 0 when none.
//
//   lengthScore   = piece-wise over description.length:
//                     0 chars                  → 0.0
//                     1–49 chars               → 0.15  (too short, heavy penalty)
//                     50–69 chars              → 0.55  (borderline)
//                     70–500 chars             → 1.0   (healthy band)
//                     501–1 000 chars          → 0.75  (long but tolerable)
//                     > 1 000 chars            → 0.4   (bloated, YouTube truncates)
//
//   score = 0.5 * keywordRatio + 0.5 * lengthScore
//

export function scoreDescriptionSeo({
  description,
  nicheKeywords,
}: {
  description: string;
  nicheKeywords: string[];
}): ComponentScore {
  const lower = description.toLowerCase();
  const len = description.trim().length;

  // --- keyword ratio ---
  const found = nicheKeywords.filter((kw) => lower.includes(kw.toLowerCase()));
  const keywordRatio =
    nicheKeywords.length === 0 ? 1.0 : found.length / nicheKeywords.length;

  // --- length score ---
  let lengthScore: number;
  if (len === 0) {
    lengthScore = 0.0;
  } else if (len < 50) {
    lengthScore = 0.15;
  } else if (len < 70) {
    lengthScore = 0.55;
  } else if (len <= 500) {
    lengthScore = 1.0;
  } else if (len <= 1000) {
    lengthScore = 0.75;
  } else {
    lengthScore = 0.4;
  }

  const score = clamp01(0.5 * keywordRatio + 0.5 * lengthScore);
  const verdict = verdictFromScore(score);

  // --- suggestions ---
  const suggestions: ReviewSuggestion[] = [];

  const missing = nicheKeywords.filter((kw) => !lower.includes(kw.toLowerCase()));
  if (missing.length > 0) {
    suggestions.push({
      component: 'description_seo',
      severity: verdict,
      suggestion_text: `Mention ${missing.join(', ')} in the description`,
    });
  }

  if (len === 0) {
    suggestions.push({
      component: 'description_seo',
      severity: 'fail',
      suggestion_text:
        'Add a description — aim for 70–500 characters covering your niche keywords.',
    });
  } else if (len < 70) {
    suggestions.push({
      component: 'description_seo',
      severity: verdict,
      suggestion_text:
        'Lengthen the description to at least 70 characters for better SEO signal.',
    });
  }

  return { score, verdict, suggestions };
}

// ---------------------------------------------------------------------------
// scoreHookFromTranscript
// ---------------------------------------------------------------------------
//
// Scoring formula:
//
//   cueHits  = number of distinct cue patterns matched in firstThreeSecondsText
//   maxCues  = 10  (soft ceiling — more cues are still good but we normalise here)
//
//   cueRatio = min(cueHits / maxCues, 1)
//
//   lengthBonus = 0.1 when text.trim().length ≥ 20; else 0
//                 (very short snippets lose a small bonus even if they hit a cue)
//
//   score = clamp(cueRatio * 0.9 + lengthBonus, 0, 1)
//
//   Verdict bands: pass ≥ 0.45, needs_work ≥ 0.15, fail < 0.15
//   (bands shifted lower than the generic helper because cue-rich is genuinely harder)
//

// Ordered from most specific to least; each pattern is tested case-insensitively.
const HOOK_CUES: RegExp[] = [
  /you won't believe/i,
  /you will not believe/i,
  /did you know/i,
  /here'?s why/i,
  /the secret/i,
  /what if/i,
  /imagine/i,
  /never/i,
  /\bstop\b/i,
  /\bwait\b/i,
  // Leading number or stat (digit at very start after optional whitespace)
  /^\s*\d/,
  // Leading question (text starts with or shortly contains "?")
  /\?/,
];

function hookVerdictFromScore(score: number): ReviewVerdict {
  if (score >= 0.45) return 'pass';
  if (score >= 0.15) return 'needs_work';
  return 'fail';
}

export function scoreHookFromTranscript({
  firstThreeSecondsText,
}: {
  firstThreeSecondsText: string;
}): ComponentScore {
  const trimmed = firstThreeSecondsText.trim();

  if (trimmed.length === 0) {
    return {
      score: 0,
      verdict: 'fail',
      suggestions: [
        {
          component: 'hook',
          severity: 'fail',
          suggestion_text:
            'Open with a stronger curiosity gap or stat in the first 3 seconds',
        },
      ],
    };
  }

  // Count distinct cue pattern matches (each pattern at most once).
  const cueHits = HOOK_CUES.filter((re) => re.test(firstThreeSecondsText)).length;
  const maxCues = 10;
  const cueRatio = Math.min(cueHits / maxCues, 1);

  const lengthBonus = trimmed.length >= 20 ? 0.1 : 0;

  const score = clamp01(cueRatio * 0.9 + lengthBonus);
  const verdict = hookVerdictFromScore(score);

  const suggestions: ReviewSuggestion[] = [];
  if (verdict !== 'pass') {
    suggestions.push({
      component: 'hook',
      severity: verdict,
      suggestion_text:
        'Open with a stronger curiosity gap or stat in the first 3 seconds',
    });
  }

  return { score, verdict, suggestions };
}
