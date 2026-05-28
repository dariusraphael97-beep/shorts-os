import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  upsertShortsObservation,
  getShortsObservationByVideoId,
  listShortsObservationsBySource,
} from '@/lib/supabase/repositories/shorts-observations';

beforeEach(() => vi.clearAllMocks());

function makeClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  return {
    from: () => ({
      upsert: () => ({
        select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }),
      }),
      select: () => ({
        eq: () => ({
          single: async () => ({ data: rows?.[0] ?? null, error }),
          maybeSingle: async () => ({ data: rows?.[0] ?? null, error }),
          order: () => ({ limit: () => ({ then: (r: (v: { data: unknown[]; error: unknown }) => unknown) => r({ data: rows ?? [], error }) }) }),
        }),
      }),
    }),
  } as never;
}

describe('shorts-observations repository', () => {
  it('upsertShortsObservation returns inserted row', async () => {
    const row = { video_id: 'abc', source: 'youtube_most_popular', title: 't', view_count: 100 };
    const client = makeClient([row]);
    const result = await upsertShortsObservation(client, {
      videoId: 'abc',
      source: 'youtube_most_popular',
      title: 't',
      viewCount: 100,
      durationSeconds: 30,
      publishedAt: new Date('2026-05-28'),
      observedAt: new Date('2026-05-28'),
    });
    expect(result.video_id).toBe('abc');
  });

  it('getShortsObservationByVideoId returns null on PGRST116', async () => {
    const client = makeClient(null, { code: 'PGRST116' });
    const result = await getShortsObservationByVideoId(client, 'missing');
    expect(result).toBeNull();
  });

  it('listShortsObservationsBySource returns array', async () => {
    const client = makeClient([{ video_id: 'a' }, { video_id: 'b' }]);
    const result = await listShortsObservationsBySource(client, 'youtube_most_popular', 50);
    expect(result).toHaveLength(2);
  });
});
