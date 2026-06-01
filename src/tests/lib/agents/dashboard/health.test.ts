import { describe, it, expect } from 'vitest';
import { deriveHealthPill } from '@/lib/agents/dashboard/health';

describe('deriveHealthPill', () => {
  it('healthy when no errored agents and crons fresh', () => {
    const r = deriveHealthPill({ erroredAgents: [], staleCrons: [], failedCrons: [] });
    expect(r.level).toBe('healthy');
  });
  it('attention when an agent errored', () => {
    const r = deriveHealthPill({ erroredAgents: ['niche_scout'], staleCrons: [], failedCrons: [] });
    expect(r.level).toBe('attention');
    expect(r.summary).toContain('1');
  });
  it('critical when a cron failed', () => {
    const r = deriveHealthPill({ erroredAgents: [], staleCrons: [], failedCrons: ['cluster-niches'] });
    expect(r.level).toBe('critical');
  });
});
