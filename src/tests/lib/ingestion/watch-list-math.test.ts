import { describe, it, expect } from 'vitest';
import {
  computeUploadCadencePerWeek,
  computeAvgViews,
  computeOutlierRate,
  computeGrowthFraction,
  evaluateAutoAdd,
} from '@/lib/ingestion/watch-list-math';

describe('computeUploadCadencePerWeek', () => {
  it('counts uploads in the window and divides by weeks', () => {
    const now = new Date('2026-05-28T00:00:00Z');
    const dates = [new Date('2026-05-27'), new Date('2026-05-20'), new Date('2026-05-10'), new Date('2026-04-01')];
    // 3 uploads within 30d / (30/7) weeks ≈ 0.7
    expect(computeUploadCadencePerWeek(dates, 30, now)).toBeCloseTo(0.7, 1);
  });
  it('returns 0 for no uploads', () => {
    expect(computeUploadCadencePerWeek([], 30, new Date())).toBe(0);
  });
});

describe('computeAvgViews', () => {
  it('averages, returns 0 for empty', () => {
    expect(computeAvgViews([100, 200, 300])).toBe(200);
    expect(computeAvgViews([])).toBe(0);
  });
});

describe('computeOutlierRate', () => {
  it('fraction of videos with views ≥ multiplier × avg', () => {
    // avg = 100; outliers (≥300): 400, 900 → 2/4
    expect(computeOutlierRate([400, 50, 900, 60], 100, 3)).toBe(0.5);
  });
  it('returns 0 when avg is 0', () => {
    expect(computeOutlierRate([0, 0], 0, 3)).toBe(0);
  });
});

describe('computeGrowthFraction', () => {
  it('returns (current-past)/past', () => {
    expect(computeGrowthFraction(13000, 10000)).toBeCloseTo(0.3, 5);
  });
  it('returns null when past is missing or 0', () => {
    expect(computeGrowthFraction(13000, null)).toBeNull();
    expect(computeGrowthFraction(13000, 0)).toBeNull();
  });
});

describe('evaluateAutoAdd', () => {
  const base = { subscriberCount: 50000, uploadCadencePerWeek: 2, outlierRate: 0.2, subs30dAgo: 40000, atCap: false };
  it('adds as auto_outlier when subs in range + cadence + outliers', () => {
    expect(evaluateAutoAdd(base)).toEqual({ add: true, source: 'auto_outlier' });
  });
  it('adds as auto_breakout when subs doubled vs 30d ago (and outlier path not met)', () => {
    expect(evaluateAutoAdd({ ...base, outlierRate: 0, uploadCadencePerWeek: 0, subs30dAgo: 20000 }))
      .toEqual({ add: true, source: 'auto_breakout' });
  });
  it('does not add when subs out of 5k-500k range', () => {
    expect(evaluateAutoAdd({ ...base, subscriberCount: 800000 }).add).toBe(false);
    expect(evaluateAutoAdd({ ...base, subscriberCount: 1000 }).add).toBe(false);
  });
  it('does not add when at cap', () => {
    expect(evaluateAutoAdd({ ...base, atCap: true }).add).toBe(false);
  });
  it('does not add when neither path qualifies', () => {
    expect(evaluateAutoAdd({ ...base, outlierRate: 0.05, uploadCadencePerWeek: 0.5, subs30dAgo: 49000 }).add).toBe(false);
  });
});
