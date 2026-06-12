import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import { listRecentJobs } from '@/lib/supabase/repositories/jobs';
import { listRecentRenderJobs } from '@/lib/supabase/repositories/render-jobs';
import { listRecentReviews } from '@/lib/supabase/repositories/video-reviews';

beforeEach(() => vi.clearAllMocks());

function makeListClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  return {
    from: () => ({
      select: () => ({
        order: () => ({
          limit: async () => ({ data: rows ?? [], error }),
        }),
      }),
    }),
  } as never;
}

describe('listRecentJobs', () => {
  it('returns recent jobs newest-first', async () => {
    const client = makeListClient([{ id: 'j1', kind: 'produce_longform_video', status: 'running' }]);
    const result = await listRecentJobs(client, 20);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('j1');
  });
  it('throws a labelled error', async () => {
    const client = makeListClient(null, { message: 'boom' });
    await expect(listRecentJobs(client, 20)).rejects.toThrow('listRecentJobs: boom');
  });
});

describe('listRecentRenderJobs', () => {
  it('returns recent render jobs', async () => {
    const client = makeListClient([{ id: 'r1', job_type: 'render_longform', status: 'failed' }]);
    const result = await listRecentRenderJobs(client, 20);
    expect(result[0].job_type).toBe('render_longform');
  });
});

describe('listRecentReviews', () => {
  it('flattens the joined your_videos title/status', async () => {
    const client = makeListClient([
      {
        id: 'rev1',
        your_video_id: 'v1',
        reviewed_at: '2026-06-11T08:00:00Z',
        overall_verdict: 'revise',
        your_videos: { title: 'B58', status: 'rendered' },
      },
    ]);
    const result = await listRecentReviews(client, 10);
    expect(result[0].video_title).toBe('B58');
    expect(result[0].video_status).toBe('rendered');
    expect(result[0].overall_verdict).toBe('revise');
  });
  it('tolerates a missing join row', async () => {
    const client = makeListClient([
      { id: 'rev1', your_video_id: 'v1', reviewed_at: '2026-06-11T08:00:00Z', overall_verdict: 'ship', your_videos: null },
    ]);
    const result = await listRecentReviews(client, 10);
    expect(result[0].video_title).toBeNull();
  });
});
