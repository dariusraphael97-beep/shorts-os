import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  insertNichePrediction,
  attachActualOutcome,
  listPredictionsByCluster,
} from '@/lib/supabase/repositories/niche-predictions';

beforeEach(() => vi.clearAllMocks());

function makeClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  return {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }) }),
      update: () => ({
        eq: () => ({ select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }) }),
      }),
      select: () => ({
        eq: () => ({
          single: async () => ({ data: rows?.[0] ?? null, error }),
          order: () => ({ then: (r: (v: { data: unknown[]; error: unknown }) => unknown) => r({ data: rows ?? [], error }) }),
        }),
      }),
    }),
  } as never;
}

describe('niche-predictions repository', () => {
  it('insertNichePrediction stores sealed range', async () => {
    const row = { id: 'p1', niche_cluster_id: 'c1', predicted_views_7d_lower: 5000, predicted_views_7d_upper: 25000 };
    const client = makeClient([row]);
    const result = await insertNichePrediction(client, {
      nicheClusterId: 'c1',
      predictedViews7dLower: 5000,
      predictedViews7dUpper: 25000,
    });
    expect(result.id).toBe('p1');
  });

  it('attachActualOutcome computes accuracy_verdict=within', async () => {
    const row = { id: 'p1', actual_views_7d: 12000, accuracy_verdict: 'within' };
    const client = makeClient([row]);
    const result = await attachActualOutcome(client, 'p1', 12000);
    expect(result.accuracy_verdict).toBe('within');
  });
});
