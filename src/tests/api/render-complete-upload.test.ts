import { describe, it, expect, vi, beforeEach } from 'vitest';

const TEST_JOB_ID = '550e8400-e29b-41d4-a716-446655440001';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));
vi.mock('@/lib/render/callback-token', () => ({
  verifyCallbackToken: vi.fn(() => ({ jobId: TEST_JOB_ID })),
  CallbackTokenError: class extends Error {},
}));
vi.mock('@/lib/supabase/repositories/render-jobs', () => ({
  markJobSucceeded: vi.fn(async () => 1),
  markJobFailed: vi.fn(async () => 1),
}));
vi.mock('@/lib/supabase/repositories/your-videos', () => ({
  markPosted: vi.fn(),
}));

import { POST } from '@/app/api/render/complete/route';
import { markPosted } from '@/lib/supabase/repositories/your-videos';
import { getServiceClient } from '@/lib/supabase/server';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServiceClient).mockReturnValue({
    from: (table: string) => {
      if (table === 'render_jobs') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { job_type: 'upload', your_video_id: 'video-1' },
                error: null,
              }),
              single: async () => ({
                data: { your_video_id: 'video-1', compilation_draft_id: null, job_type: 'upload' },
                error: null,
              }),
            }),
          }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      if (table === 'your_videos') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { channel_id: 'chan-1' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'channels') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { timezone: 'America/New_York' }, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as never);
});

describe('POST /api/render/complete — upload branch', () => {
  it('writes posted_at + external_video_id + url + hour_local + dow_local', async () => {
    const req = new Request('https://app/api/render/complete', {
      method: 'POST',
      headers: { authorization: 'Bearer TOKEN', 'content-type': 'application/json' },
      body: JSON.stringify({
        job_id: TEST_JOB_ID,
        sandbox_invocation_id: 'inv-1',
        result: {
          status: 'succeeded',
          output: {
            your_video_id: 'video-1',
            external_video_id: 'YT_ID',
            url: 'https://www.youtube.com/shorts/YT_ID',
          },
        },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(vi.mocked(markPosted)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        videoId: 'video-1',
        externalVideoId: 'YT_ID',
        url: 'https://www.youtube.com/shorts/YT_ID',
        channelTimezone: 'America/New_York',
      }),
    );
  });
});
