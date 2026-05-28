import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn(() => ({} as never)) }));
vi.mock('@/lib/supabase/repositories/your-videos', () => ({
  cancelSchedule: vi.fn(),
}));

import { POST } from '@/app/api/lab/cancel-schedule/route';
import { cancelSchedule } from '@/lib/supabase/repositories/your-videos';

const UUID = '11111111-1111-1111-1111-111111111111';
beforeEach(() => vi.clearAllMocks());

function req(body: unknown): Request {
  return new Request('https://app/api/lab/cancel-schedule', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('POST /api/lab/cancel-schedule', () => {
  it('400 on missing videoId', async () => {
    expect((await POST(req({}))).status).toBe(400);
  });
  it('409 when cancelSchedule returns false', async () => {
    vi.mocked(cancelSchedule).mockResolvedValue(false);
    expect((await POST(req({ videoId: UUID }))).status).toBe(409);
  });
  it('200 happy path', async () => {
    vi.mocked(cancelSchedule).mockResolvedValue(true);
    expect((await POST(req({ videoId: UUID }))).status).toBe(200);
  });
});
