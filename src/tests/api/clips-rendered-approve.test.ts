import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn(() => ({} as never)) }));
vi.mock('@/lib/supabase/repositories/compilation-drafts', () => ({
  getDraftById: vi.fn(),
  setPromotedYourVideoId: vi.fn(),
}));
vi.mock('@/lib/supabase/repositories/your-videos', () => ({
  createPromotedVideo: vi.fn(async () => 'yv-id'),
  slotIsOccupied: vi.fn(async () => false),
}));
vi.mock('@/lib/supabase/repositories/channels', () => ({
  getDefaultChannel: vi.fn(async () => ({
    id: 'c1', timezone: 'America/New_York',
    posting_schedule: { weekdays: ['07:30'], weekends: ['11:30'] },
  })),
}));
vi.mock('@/lib/supabase/repositories/render-jobs', () => ({
  enqueueRenderJob: vi.fn(async () => ({ id: 'job-x' })),
}));
vi.mock('@/lib/timezone', () => ({
  nextOpenSlotAfter: vi.fn(),
  BacklogOverflowError: class extends Error {},
}));

import { POST } from '@/app/api/clips/rendered/[id]/approve/route';
import { getDraftById } from '@/lib/supabase/repositories/compilation-drafts';
import { createPromotedVideo } from '@/lib/supabase/repositories/your-videos';
import { enqueueRenderJob } from '@/lib/supabase/repositories/render-jobs';
import { nextOpenSlotAfter } from '@/lib/timezone';

const DRAFT = {
  id: 'd1', channel_id: 'c1', status: 'rendered' as const,
  title_template: 'Top 5 Cars',
  rendered_path: 'https://blob/d1.mp4',
  clip_refs: [{ start_sec: 0, end_sec: 6 }, { start_sec: 0, end_sec: 6 }, { start_sec: 0, end_sec: 6 }, { start_sec: 0, end_sec: 6 }, { start_sec: 0, end_sec: 6 }],
};

beforeEach(() => vi.clearAllMocks());

async function callPOST(action: 'schedule' | 'post_now' | null) {
  const url = action ? `https://app/api/clips/rendered/d1/approve?action=${action}` : 'https://app/api/clips/rendered/d1/approve';
  const req = new Request(url, { method: 'POST' });
  return POST(req, { params: Promise.resolve({ id: 'd1' }) });
}

describe('POST /api/clips/rendered/[id]/approve', () => {
  it('404 on unknown draft', async () => {
    vi.mocked(getDraftById).mockResolvedValue(null);
    expect((await callPOST(null)).status).toBe(404);
  });

  it('409 when draft not in rendered status', async () => {
    vi.mocked(getDraftById).mockResolvedValue({ ...DRAFT, status: 'posted' } as never);
    expect((await callPOST(null)).status).toBe(409);
  });

  it('422 when rendered_path missing', async () => {
    vi.mocked(getDraftById).mockResolvedValue({ ...DRAFT, rendered_path: null } as never);
    expect((await callPOST(null)).status).toBe(422);
  });

  it('default action=schedule promotes with status=scheduled + scheduled_for', async () => {
    const { DateTime } = await import('luxon');
    vi.mocked(getDraftById).mockResolvedValue(DRAFT as never);
    vi.mocked(nextOpenSlotAfter).mockResolvedValue(DateTime.fromISO('2026-06-01T11:30:00Z'));
    const res = await callPOST(null);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scheduled_for).toBe('2026-06-01T11:30:00.000Z');
    expect(vi.mocked(createPromotedVideo)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetStatus: 'scheduled' }),
    );
  });

  it('action=post_now promotes with status=uploading + enqueues upload job', async () => {
    vi.mocked(getDraftById).mockResolvedValue(DRAFT as never);
    const res = await callPOST('post_now');
    expect(res.status).toBe(200);
    expect(vi.mocked(createPromotedVideo)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetStatus: 'uploading' }),
    );
    expect(vi.mocked(enqueueRenderJob)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ jobType: 'upload' }),
    );
  });

  it('503 when nextOpenSlotAfter throws BacklogOverflowError', async () => {
    const { BacklogOverflowError } = await import('@/lib/timezone');
    vi.mocked(getDraftById).mockResolvedValue(DRAFT as never);
    vi.mocked(nextOpenSlotAfter).mockRejectedValue(new BacklogOverflowError('c1'));
    expect((await callPOST('schedule')).status).toBe(503);
  });
});
