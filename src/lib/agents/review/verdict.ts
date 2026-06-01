import type { Verdict, ReviewDimension, ReviewScorecardProps } from '@/components/compositions/review-scorecard';

export type ReviewVerdict = 'pass' | 'needs_work' | 'fail';
export type OverallVerdict = 'ship' | 'revise' | 'block';

export interface ReviewRowInput {
  title_score: number | null;
  title_verdict: ReviewVerdict | null;
  thumbnail_score: number | null;
  thumbnail_verdict: ReviewVerdict | null;
  hook_score: number | null;
  hook_verdict: ReviewVerdict | null;
  pacing_score: number | null;
  pacing_verdict: ReviewVerdict | null;
  description_seo_score: number | null;
  description_seo_verdict: ReviewVerdict | null;
  audio_score: number | null;
  audio_verdict: ReviewVerdict | null;
  visual_score: number | null;
  visual_verdict: ReviewVerdict | null;
  overall_verdict: OverallVerdict;
}

export function dbVerdictToDimension(v: ReviewVerdict): Verdict {
  if (v === 'needs_work') return 'warn';
  if (v === 'fail') return 'fail';
  return 'pass';
}

export function overallToScorecardVerdict(v: OverallVerdict): Verdict {
  if (v === 'block') return 'fail';
  if (v === 'revise') return 'warn';
  return 'pass';
}

export function rollUpOverall(verdicts: ReviewVerdict[]): OverallVerdict {
  if (verdicts.some((v) => v === 'fail')) return 'block';
  if (verdicts.some((v) => v === 'needs_work')) return 'revise';
  return 'ship';
}

const NOTE: Record<Verdict, string> = {
  pass: 'Looks good',
  warn: 'Could be improved',
  fail: 'Needs work',
};

interface ComponentDef {
  key: string;
  label: string;
  score: number | null;
  verdict: ReviewVerdict | null;
}

export function mapReviewToScorecard(review: ReviewRowInput): ReviewScorecardProps {
  const components: ComponentDef[] = [
    { key: 'title', label: 'Title', score: review.title_score, verdict: review.title_verdict },
    { key: 'thumbnail', label: 'Thumbnail', score: review.thumbnail_score, verdict: review.thumbnail_verdict },
    { key: 'hook', label: 'Hook', score: review.hook_score, verdict: review.hook_verdict },
    { key: 'pacing', label: 'Pacing', score: review.pacing_score, verdict: review.pacing_verdict },
    { key: 'description_seo', label: 'Description SEO', score: review.description_seo_score, verdict: review.description_seo_verdict },
    { key: 'audio', label: 'Audio', score: review.audio_score, verdict: review.audio_verdict },
    { key: 'visual', label: 'Visual', score: review.visual_score, verdict: review.visual_verdict },
  ];

  const dimensions: ReviewDimension[] = components.map(({ key, label, verdict }) => {
    const v = dbVerdictToDimension(verdict ?? 'needs_work');
    return { key, label, verdict: v, note: NOTE[v] };
  });

  const nonNullScores = components.map((c) => c.score).filter((s): s is number => s !== null);
  const overallScore =
    nonNullScores.length > 0
      ? Math.round((nonNullScores.reduce((a, b) => a + b, 0) / nonNullScores.length) * 100)
      : undefined;

  return {
    overallVerdict: overallToScorecardVerdict(review.overall_verdict),
    ...(overallScore !== undefined ? { overallScore } : {}),
    dimensions,
  };
}
