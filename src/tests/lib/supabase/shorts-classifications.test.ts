import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  upsertClassification,
  getClassificationByVideoId,
  listStaleClassifications,
} from '@/lib/supabase/repositories/shorts-classifications';

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
        }),
        neq: () => ({
          limit: () => ({ then: (r: (v: { data: unknown[]; error: unknown }) => unknown) => r({ data: rows ?? [], error }) }),
        }),
      }),
    }),
  } as never;
}

describe('shorts-classifications repository', () => {
  it('upsertClassification stores label set', async () => {
    const row = { video_id: 'abc', topic_label: 'AI for seniors', format_label: 'narrated_storytelling', confidence: 0.84 };
    const client = makeClient([row]);
    const result = await upsertClassification(client, {
      videoId: 'abc',
      topicLabel: 'AI for seniors',
      formatLabel: 'narrated_storytelling',
      audienceSignal: 'seniors',
      confidence: 0.84,
      model: 'anthropic/claude-haiku-4-5',
      promptVersion: 'v1',
      visionUsed: true,
      transcriptUsed: true,
    });
    expect(result.topic_label).toBe('AI for seniors');
  });

  it('listStaleClassifications filters by promptVersion', async () => {
    const client = makeClient([{ video_id: 'a', prompt_version: 'v1' }]);
    const result = await listStaleClassifications(client, 'v2', 500);
    expect(result).toHaveLength(1);
  });
});
