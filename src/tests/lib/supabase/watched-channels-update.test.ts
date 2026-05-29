import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import { updateWatchedChannelSnapshot } from '@/lib/supabase/repositories/watched-channels';

beforeEach(() => vi.clearAllMocks());

function makeClient(row: Record<string, unknown> | null, error: unknown = null) {
  return {
    from: () => ({
      update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: row, error }) }) }) }),
    }),
  } as never;
}

describe('updateWatchedChannelSnapshot', () => {
  it('updates snapshot fields and returns the row', async () => {
    const row = { channel_id: 'UC1', current_subscriber_count: 13000, outlier_rate_60d: 0.2 };
    const result = await updateWatchedChannelSnapshot(makeClient(row), {
      channelId: 'UC1',
      currentSubscriberCount: 13000,
      subscriberGrowth30d: 0.08,
      subscriberGrowth90d: 0.25,
      outlierRate60d: 0.2,
      uploadCadencePerWeek: 4,
      lastSnapshottedAt: new Date('2026-05-28T00:00:00Z'),
    });
    expect(result.channel_id).toBe('UC1');
    expect(result.current_subscriber_count).toBe(13000);
  });
});
