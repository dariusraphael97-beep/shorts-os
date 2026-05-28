import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  upsertWatchedChannel,
  listActiveWatchedChannels,
  evictInactiveWatchedChannels,
} from '@/lib/supabase/repositories/watched-channels';

beforeEach(() => vi.clearAllMocks());

function makeClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  return {
    from: () => ({
      upsert: () => ({ select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }) }),
      update: () => ({ eq: () => ({ select: () => ({ then: (r: (v: { data: unknown[]; error: unknown; count: number }) => unknown) => r({ data: rows ?? [], error, count: rows?.length ?? 0 }) }) }) }),
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => ({ then: (r: (v: { data: unknown[]; error: unknown }) => unknown) => r({ data: rows ?? [], error }) }) }),
        }),
      }),
    }),
  } as never;
}

describe('watched-channels repository', () => {
  it('upsertWatchedChannel adds channel', async () => {
    const row = { channel_id: 'UC123', channel_title: 'Cool Channel', is_active: true };
    const client = makeClient([row]);
    const result = await upsertWatchedChannel(client, {
      channelId: 'UC123',
      channelHandle: '@cool',
      channelTitle: 'Cool Channel',
      channelThumbnailUrl: 'https://...',
      subscriberCountAtAdd: 12000,
      currentSubscriberCount: 12000,
      uploadCadencePerWeek: 3,
      outlierRate60d: 0.15,
      discoverySource: 'manual',
    });
    expect(result.channel_id).toBe('UC123');
  });

  it('listActiveWatchedChannels returns array', async () => {
    const client = makeClient([{ channel_id: 'a' }, { channel_id: 'b' }]);
    const result = await listActiveWatchedChannels(client, 100);
    expect(result).toHaveLength(2);
  });
});
