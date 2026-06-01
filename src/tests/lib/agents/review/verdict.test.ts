import { describe, it, expect } from 'vitest';
import { rollUpOverall, mapReviewToScorecard, dbVerdictToDimension, overallToScorecardVerdict } from '@/lib/agents/review/verdict';

describe('review verdict mapping', () => {
  it('maps needs_work → warn', () => {
    expect(dbVerdictToDimension('needs_work')).toBe('warn');
  });
  it('rolls up to block if any component fails', () => {
    expect(rollUpOverall(['pass','pass','fail','pass','pass','pass','pass'])).toBe('block');
  });
  it('rolls up to revise if any needs_work but none fail', () => {
    expect(rollUpOverall(['pass','needs_work','pass','pass','pass','pass','pass'])).toBe('revise');
  });
  it('rolls up to ship if all pass', () => {
    expect(rollUpOverall(['pass','pass','pass','pass','pass','pass','pass'])).toBe('ship');
  });
  it('maps a VideoReview row to ReviewScorecardProps with 7 dimensions and 0–100 scores', () => {
    const props = mapReviewToScorecard({
      title_score: 0.8, title_verdict: 'pass', thumbnail_score: 0.5, thumbnail_verdict: 'needs_work',
      hook_score: 0.9, hook_verdict: 'pass', pacing_score: 0.7, pacing_verdict: 'pass',
      description_seo_score: 0.6, description_seo_verdict: 'needs_work', audio_score: 0.95, audio_verdict: 'pass',
      visual_score: 0.85, visual_verdict: 'pass', overall_verdict: 'revise',
    } as never);
    expect(props.dimensions).toHaveLength(7);
    expect(props.overallVerdict).toBe('warn');
    expect(props.dimensions[0].verdict).toBe('pass');
    // overallScore should be in 0–100 range
    expect(props.overallScore).toBeGreaterThanOrEqual(0);
    expect(props.overallScore).toBeLessThanOrEqual(100);
  });
  it('overallToScorecardVerdict maps block → fail and ship → pass', () => {
    expect(overallToScorecardVerdict('block')).toBe('fail');
    expect(overallToScorecardVerdict('ship')).toBe('pass');
  });
});
