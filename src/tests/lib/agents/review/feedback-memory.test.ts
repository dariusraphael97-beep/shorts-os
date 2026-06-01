import { describe, it, expect } from 'vitest';
import {
  rollupPredictionAccuracy,
  rollupReviewFeedback,
  type PredictionAccuracy,
  type ReviewFeedbackWeights,
} from '@/lib/agents/review/feedback-memory';

describe('rollupPredictionAccuracy', () => {
  it('initialises from null with within=1', () => {
    const result = rollupPredictionAccuracy(null, 'within');
    expect(result).toEqual({ within: 1, above: 0, below: 0, n: 1 });
  });

  it('initialises from null with above=1', () => {
    const result = rollupPredictionAccuracy(null, 'above');
    expect(result).toEqual({ within: 0, above: 1, below: 0, n: 1 });
  });

  it('initialises from null with below=1', () => {
    const result = rollupPredictionAccuracy(null, 'below');
    expect(result).toEqual({ within: 0, above: 0, below: 1, n: 1 });
  });

  it('accumulates two outcomes correctly', () => {
    const first = rollupPredictionAccuracy(null, 'within');
    const second = rollupPredictionAccuracy(first, 'below');
    expect(second).toEqual({ within: 1, above: 0, below: 1, n: 2 });
  });

  it('does NOT mutate the input object', () => {
    const input: PredictionAccuracy = { within: 3, above: 1, below: 2, n: 6 };
    const frozen = { ...input };
    rollupPredictionAccuracy(input, 'within');
    expect(input).toEqual(frozen);
  });
});

describe('rollupReviewFeedback', () => {
  it('initialises from null with hook accepted=1', () => {
    const result = rollupReviewFeedback(null, { component: 'hook', actionTaken: 'accepted' });
    expect(result).toEqual({ hook: { accepted: 1, ignored: 0, partial: 0 } });
  });

  it('accumulates a second action on the same component', () => {
    const first = rollupReviewFeedback(null, { component: 'hook', actionTaken: 'accepted' });
    const second = rollupReviewFeedback(first, { component: 'hook', actionTaken: 'ignored' });
    expect(second).toEqual({ hook: { accepted: 1, ignored: 1, partial: 0 } });
  });

  it('adds a new bucket for a different component', () => {
    const first = rollupReviewFeedback(null, { component: 'hook', actionTaken: 'accepted' });
    const second = rollupReviewFeedback(first, { component: 'title', actionTaken: 'partial' });
    expect(second).toEqual({
      hook: { accepted: 1, ignored: 0, partial: 0 },
      title: { accepted: 0, ignored: 0, partial: 1 },
    });
  });

  it('does NOT mutate the input object', () => {
    const input: ReviewFeedbackWeights = {
      hook: { accepted: 2, ignored: 1, partial: 0 },
    };
    const snapshot = JSON.stringify(input);
    rollupReviewFeedback(input, { component: 'hook', actionTaken: 'accepted' });
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
