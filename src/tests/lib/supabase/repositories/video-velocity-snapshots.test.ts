import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  insertVelocitySnapshot,
  listSnapshotsForVideo,
} from '@/lib/supabase/repositories/video-velocity-snapshots';

beforeEach(() => vi.clearAllMocks());

function makeClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  return {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }) }),
      select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ then: (r: (v: { data: unknown[]; error: unknown }) => unknown) => r({ data: rows ?? [], error }) }) }) }) }),
    }),
  } as never;
}

describe('video-velocity-snapshots repository', () => {
  it('insertVelocitySnapshot returns the row', async () => {
    const row = { video_id: 'v1', view_count: 5000 };
    const result = await insertVelocitySnapshot(makeClient([row]), { videoId: 'v1', viewCount: 5000, likeCount: 10, commentCount: 2 });
    expect(result.video_id).toBe('v1');
  });

  it('listSnapshotsForVideo returns rows', async () => {
    const result = await listSnapshotsForVideo(makeClient([{ video_id: 'v1' }, { video_id: 'v1' }]), { videoId: 'v1', limit: 5 });
    expect(result).toHaveLength(2);
  });
});
