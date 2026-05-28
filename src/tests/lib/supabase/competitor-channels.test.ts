import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  addCompetitorChannel,
  listCompetitorChannels,
} from '@/lib/supabase/repositories/competitor-channels';

beforeEach(() => vi.clearAllMocks());

function makeClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  return {
    from: () => ({
      upsert: () => ({ select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }) }),
      select: () => ({
        eq: () => ({
          order: () => ({ then: (r: (v: { data: unknown[]; error: unknown }) => unknown) => r({ data: rows ?? [], error }) }),
        }),
      }),
    }),
  } as never;
}

describe('competitor-channels repository', () => {
  it('addCompetitorChannel returns inserted row', async () => {
    const row = { channel_id: 'UC456', channel_handle: '@comp' };
    const client = makeClient([row]);
    const result = await addCompetitorChannel(client, {
      channelId: 'UC456',
      channelHandle: '@comp',
    });
    expect(result.channel_id).toBe('UC456');
  });

  it('listCompetitorChannels returns active list', async () => {
    const client = makeClient([{ channel_id: 'a' }]);
    const result = await listCompetitorChannels(client);
    expect(result).toHaveLength(1);
  });
});
