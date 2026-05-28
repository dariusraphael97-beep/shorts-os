import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  insertNicheCluster,
  listDigestRankedClusters,
  getClusterById,
} from '@/lib/supabase/repositories/niche-clusters';

beforeEach(() => vi.clearAllMocks());

function makeClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  return {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }) }),
      select: () => ({
        eq: () => ({
          single: async () => ({ data: rows?.[0] ?? null, error }),
          maybeSingle: async () => ({ data: rows?.[0] ?? null, error }),
          order: () => ({ limit: () => ({ then: (r: (v: { data: unknown[]; error: unknown }) => unknown) => r({ data: rows ?? [], error }) }) }),
          not: () => ({ order: () => ({ then: (r: (v: { data: unknown[]; error: unknown }) => unknown) => r({ data: rows ?? [], error }) }) }),
        }),
      }),
    }),
  } as never;
}

describe('niche-clusters repository', () => {
  it('insertNicheCluster returns inserted row', async () => {
    const row = { id: 'c1', week_start: '2026-05-25', canonical_topic: 'AI for seniors', format_label: 'narrated_storytelling' };
    const client = makeClient([row]);
    const result = await insertNicheCluster(client, {
      weekStart: '2026-05-25',
      canonicalTopic: 'AI for seniors',
      formatLabel: 'narrated_storytelling',
      exampleVideoIds: ['v1','v2','v3'],
      channelCount: 12,
      avgViews: 500000,
      avgVelocity24h: 6.2,
      outlierDensity: 0.75,
      firstSeenAt: new Date('2026-05-20'),
      firstMoverScore: 0.85,
      provenScore: 0.72,
      nicheScore: 0.78,
      discoveryState: 'pre_public',
      productionFit: 'native',
      audienceSignal: 'seniors',
      explainabilityTopSignals: { first_mover: 0.85, low_saturation: 0.7 },
    });
    expect(result.id).toBe('c1');
  });

  it('listDigestRankedClusters filters by week + non-null rank', async () => {
    const client = makeClient([{ id: 'c1', digest_rank: 1 }, { id: 'c2', digest_rank: 2 }]);
    const result = await listDigestRankedClusters(client, '2026-05-25');
    expect(result).toHaveLength(2);
  });
});
