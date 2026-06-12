import { describe, it, expect } from 'vitest';
import { relativeTime } from '@/lib/format/relative-time';

const NOW = new Date('2026-06-11T12:00:00Z');

describe('relativeTime', () => {
  it('renders sub-minute as "just now"', () => {
    expect(relativeTime('2026-06-11T11:59:40Z', NOW)).toBe('just now');
  });
  it('renders minutes', () => {
    expect(relativeTime('2026-06-11T11:56:00Z', NOW)).toBe('4m ago');
  });
  it('renders hours', () => {
    expect(relativeTime('2026-06-11T09:00:00Z', NOW)).toBe('3h ago');
  });
  it('renders days under a week', () => {
    expect(relativeTime('2026-06-09T12:00:00Z', NOW)).toBe('2d ago');
  });
  it('falls back to a short date beyond a week', () => {
    expect(relativeTime('2026-05-20T12:00:00Z', NOW)).toMatch(/May/);
  });
});
