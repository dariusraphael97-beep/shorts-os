import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  recordKillCriteriaEvaluation,
  listKillCriteriaEvaluations,
} from '@/lib/supabase/repositories/kill-criteria';

beforeEach(() => vi.clearAllMocks());

function makeClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  return {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }) }),
      select: () => ({
        order: () => ({ then: (r: (v: { data: unknown[]; error: unknown }) => unknown) => r({ data: rows ?? [], error }) }),
      }),
    }),
  } as never;
}

describe('kill-criteria repository', () => {
  it('recordKillCriteriaEvaluation stores verdict + evidence', async () => {
    const row = { id: 'k1', criterion: '90d_videos_over_1000', verdict: 'pass' };
    const client = makeClient([row]);
    const result = await recordKillCriteriaEvaluation(client, {
      criterion: '90d_videos_over_1000',
      verdict: 'pass',
      evidence: { count: 4 },
      decisionText: 'on track',
    });
    expect(result.verdict).toBe('pass');
  });

  it('listKillCriteriaEvaluations returns history', async () => {
    const client = makeClient([{ id: 'k1' }, { id: 'k2' }]);
    const result = await listKillCriteriaEvaluations(client);
    expect(result).toHaveLength(2);
  });
});
