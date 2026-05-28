import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));
vi.mock('@/lib/supabase/repositories/render-jobs', () => ({
  enqueueRenderJob: vi.fn(),
}));

import { POST } from '@/app/api/lab/upload/route';
import { getServiceClient } from '@/lib/supabase/server';
import { enqueueRenderJob } from '@/lib/supabase/repositories/render-jobs';

const UUID = '11111111-1111-1111-1111-111111111111';

function req(body: unknown): Request {
  return new Request('https://app/api/lab/upload', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

beforeEach(() => { vi.clearAllMocks(); });

describe('POST /api/lab/upload', () => {
  it('400 on missing videoId', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it('404 on unknown video', async () => {
    vi.mocked(getServiceClient).mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({ single: async () => ({ data: null, error: { code: 'PGRST116' } }) }),
        }),
      }),
    } as never);
    const res = await POST(req({ videoId: UUID }));
    expect(res.status).toBe(404);
  });

  it('409 when current status is not "rendered" or "scheduled"', async () => {
    vi.mocked(getServiceClient).mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({ single: async () => ({ data: { id: 'v1', status: 'posted' }, error: null }) }),
        }),
      }),
    } as never);
    const res = await POST(req({ videoId: UUID }));
    expect(res.status).toBe(409);
  });

  it('happy path: status->uploading, enqueues upload job', async () => {
    let updateCalled = false;
    vi.mocked(getServiceClient).mockReturnValue({
      from: (table: string) => {
        if (table !== 'your_videos') throw new Error(table);
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: { id: UUID, status: 'rendered' }, error: null }) }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq() { return this; },
            in() { return this; },
            async then(resolve: (v: { error: null; count: number }) => unknown) {
              expect(patch.status).toBe('uploading');
              updateCalled = true;
              resolve({ error: null, count: 1 });
            },
          }),
        };
      },
    } as never);
    vi.mocked(enqueueRenderJob).mockResolvedValue({ id: 'job-1' } as never);
    const res = await POST(req({ videoId: UUID }));
    expect(res.status).toBe(200);
    expect(updateCalled).toBe(true);
    expect(vi.mocked(enqueueRenderJob)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ jobType: 'upload', payload: { your_video_id: UUID }, yourVideoId: UUID }),
    );
  });
});
