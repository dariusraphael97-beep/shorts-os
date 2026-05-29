import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  insertVidiqAppearance,
  computeLagDays,
} from '@/lib/supabase/repositories/vidiq-appearances';

beforeEach(() => vi.clearAllMocks());

function makeClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  return {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }) }),
    }),
  } as never;
}

describe('vidiq-appearances repository', () => {
  it('insertVidiqAppearance stores tracking row', async () => {
    const row = { id: 'v1', canonical_topic: 'AI for seniors', format_label: 'narrated_storytelling' };
    const client = makeClient([row]);
    const result = await insertVidiqAppearance(client, {
      canonicalTopic: 'AI for seniors',
      formatLabel: 'narrated_storytelling',
      firstSurfacedByShortsOsAt: new Date('2026-05-28'),
    });
    expect(result.id).toBe('v1');
  });

  it('computeLagDays returns positive lag when external surfaced later', () => {
    const days = computeLagDays(new Date('2026-05-28'), new Date('2026-06-04'));
    expect(days).toBe(7);
  });
});
