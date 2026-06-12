import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));
vi.mock('@/lib/env', () => ({ loadEnv: () => ({ YOUTUBE_API_KEY: 'k' }) }));
vi.mock('@/lib/clients/youtube', () => ({ resolveChannel: vi.fn() }));
vi.mock('@/lib/supabase/repositories/competitor-channels', () => ({ addCompetitorChannel: vi.fn() }));

import { POST } from '@/app/api/watch-list/competitors/route';
import { getServiceClient } from '@/lib/supabase/server';
import { resolveChannel } from '@/lib/clients/youtube';
import { addCompetitorChannel } from '@/lib/supabase/repositories/competitor-channels';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServiceClient).mockReturnValue({} as never);
});

function reqWith(body: unknown) {
  return new Request('http://x/api/watch-list/competitors', { method: 'POST', body: JSON.stringify(body) });
}

describe('POST /api/watch-list/competitors', () => {
  it('400 on bad body', async () => {
    expect((await POST(reqWith({}))).status).toBe(400);
  });
  it('400 when channel cannot be resolved', async () => {
    vi.mocked(resolveChannel).mockResolvedValue(null);
    expect((await POST(reqWith({ urlOrHandle: 'nope' }))).status).toBe(400);
  });
  it('201 + adds competitor on success', async () => {
    vi.mocked(resolveChannel).mockResolvedValue({ channelId: 'UC9', title: 'Rival', handle: '@rival', thumbnailUrl: null, subscriberCount: 80000, videoCount: 50, viewCount: 5000, uploadsPlaylistId: 'UU9', publishedAt: null });
    vi.mocked(addCompetitorChannel).mockResolvedValue({ channel_id: 'UC9' } as never);
    const res = await POST(reqWith({ urlOrHandle: '@rival' }));
    expect(res.status).toBe(201);
    expect(vi.mocked(addCompetitorChannel)).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ channelId: 'UC9', channelHandle: '@rival', channelTitle: 'Rival' }));
  });
});
