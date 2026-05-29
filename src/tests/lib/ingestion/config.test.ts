import { describe, it, expect } from 'vitest';
import {
  YOUTUBE_CATEGORIES,
  SHORTS_SEARCH_SEEDS,
  REDDIT_SEED_SUBREDDITS,
  GOOGLE_TRENDS_GEO,
  rotatingSeedSlice,
} from '@/lib/ingestion/config';

describe('ingestion config', () => {
  it('has the 12 YouTube categories with id + label', () => {
    expect(YOUTUBE_CATEGORIES).toHaveLength(12);
    expect(YOUTUBE_CATEGORIES.every((c) => c.id && c.label)).toBe(true);
  });
  it('has 8-10 search seeds and ~30 subreddits', () => {
    expect(SHORTS_SEARCH_SEEDS.length).toBeGreaterThanOrEqual(8);
    expect(SHORTS_SEARCH_SEEDS.length).toBeLessThanOrEqual(10);
    expect(REDDIT_SEED_SUBREDDITS.length).toBeGreaterThanOrEqual(25);
  });
  it('GOOGLE_TRENDS_GEO is US', () => {
    expect(GOOGLE_TRENDS_GEO).toBe('US');
  });
  it('rotatingSeedSlice returns a deterministic subset by day', () => {
    const seeds = ['a', 'b', 'c', 'd', 'e', 'f'];
    const day0 = rotatingSeedSlice(seeds, 3, new Date('2026-01-01T00:00:00Z'));
    const day0again = rotatingSeedSlice(seeds, 3, new Date('2026-01-01T12:00:00Z'));
    expect(day0).toEqual(day0again);
    expect(day0).toHaveLength(3);
  });
});
