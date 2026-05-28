import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));
vi.mock('@/lib/supabase/repositories/your-videos', () => ({
  scheduleVideo: vi.fn(),
  slotIsOccupied: vi.fn(async () => false),
}));
vi.mock('@/lib/timezone', () => ({
  nextOpenSlotAfter: vi.fn(),
  BacklogOverflowError: class extends Error {},
}));

import { POST } from '@/app/api/lab/schedule/route';
import { getServiceClient } from '@/lib/supabase/server';
import { scheduleVideo } from '@/lib/supabase/repositories/your-videos';
import { nextOpenSlotAfter } from '@/lib/timezone';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServiceClient).mockReturnValue({
    from: (table: string) => {
      if (table === 'your_videos') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: 'v1', channel_id: 'c1', status: 'rendered' },
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
              single: async () => ({
                data: {
                  id: 'c1', timezone: 'America/New_York',
                  posting_schedule: { weekdays: ['07:30'], weekends: ['11:30'] },
                },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error('unmocked ' + table);
    },
  } as never);
});

function req(body: unknown): Request {
  return new Request('https://app/api/lab/schedule', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/lab/schedule', () => {
  it('400 on missing videoId', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it('happy path with explicit scheduledFor: calls scheduleVideo with that timestamp', async () => {
    vi.mocked(scheduleVideo).mockResolvedValue(true);
    const at = '2026-06-01T11:30:00.000Z';
    const res = await POST(req({ videoId: '11111111-1111-1111-1111-111111111111', scheduledFor: at }));
    expect(res.status).toBe(200);
    expect(vi.mocked(scheduleVideo)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ videoId: '11111111-1111-1111-1111-111111111111' }),
    );
    const call = vi.mocked(scheduleVideo).mock.calls[0][1];
    expect(call.scheduledFor.toISOString()).toBe(at);
  });

  it('default path computes nextOpenSlotAfter when scheduledFor missing', async () => {
    const { DateTime } = await import('luxon');
    vi.mocked(nextOpenSlotAfter).mockResolvedValue(DateTime.fromISO('2026-06-01T11:30:00Z'));
    vi.mocked(scheduleVideo).mockResolvedValue(true);
    const res = await POST(req({ videoId: '11111111-1111-1111-1111-111111111111' }));
    expect(res.status).toBe(200);
    expect(vi.mocked(nextOpenSlotAfter)).toHaveBeenCalled();
    const body = await res.json();
    expect(body.scheduled_for).toBe('2026-06-01T11:30:00.000Z');
  });

  it('409 when scheduleVideo returns false (wrong-status race)', async () => {
    vi.mocked(scheduleVideo).mockResolvedValue(false);
    const res = await POST(req({ videoId: '11111111-1111-1111-1111-111111111111', scheduledFor: '2026-06-01T11:30:00Z' }));
    expect(res.status).toBe(409);
  });
});
