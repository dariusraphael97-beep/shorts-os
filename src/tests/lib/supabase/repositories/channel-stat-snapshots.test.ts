import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  insertChannelStatSnapshot,
  getSnapshotNearestTo,
  listSnapshotsForChannel,
} from '@/lib/supabase/repositories/channel-stat-snapshots';

beforeEach(() => vi.clearAllMocks());

function makeClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  return {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }) }),
      select: () => ({
        eq: () => ({
          lte: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: rows?.[0] ?? null, error }) }) }) }),
          order: () => ({ limit: () => ({ then: (r: (v: { data: unknown[]; error: unknown }) => unknown) => r({ data: rows ?? [], error }) }) }),
        }),
      }),
    }),
  } as never;
}

describe('channel-stat-snapshots repository', () => {
  it('insertChannelStatSnapshot returns the row', async () => {
    const row = { channel_id: 'UC1', subscriber_count: 12000 };
    const result = await insertChannelStatSnapshot(makeClient([row]), { channelId: 'UC1', subscriberCount: 12000 });
    expect(result.channel_id).toBe('UC1');
  });

  it('getSnapshotNearestTo returns the closest prior snapshot or null', async () => {
    const result = await getSnapshotNearestTo(makeClient([{ channel_id: 'UC1', subscriber_count: 9000 }]), { channelId: 'UC1', targetDate: new Date('2026-04-28') });
    expect(result?.subscriber_count).toBe(9000);
    const none = await getSnapshotNearestTo(makeClient([]), { channelId: 'UC1', targetDate: new Date('2026-04-28') });
    expect(none).toBeNull();
  });

  it('listSnapshotsForChannel returns rows', async () => {
    const result = await listSnapshotsForChannel(makeClient([{ channel_id: 'UC1' }, { channel_id: 'UC1' }]), { channelId: 'UC1', limit: 10 });
    expect(result).toHaveLength(2);
  });
});
