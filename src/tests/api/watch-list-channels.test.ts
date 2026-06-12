import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));
vi.mock('@/lib/env', () => ({ loadEnv: () => ({ YOUTUBE_API_KEY: 'k' }) }));
vi.mock('@/lib/clients/youtube', () => ({ resolveChannel: vi.fn() }));
vi.mock('@/lib/supabase/repositories/watched-channels', () => ({ upsertWatchedChannel: vi.fn() }));

import { POST } from '@/app/api/watch-list/channels/route';
import { getServiceClient } from '@/lib/supabase/server';
import { resolveChannel } from '@/lib/clients/youtube';
import { upsertWatchedChannel } from '@/lib/supabase/repositories/watched-channels';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServiceClient).mockReturnValue({} as never);
});

function reqWith(body: unknown) {
  return new Request('http://x/api/watch-list/channels', { method: 'POST', body: JSON.stringify(body) });
}

describe('POST /api/watch-list/channels', () => {
  it('400 on bad body', async () => {
    expect((await POST(reqWith({}))).status).toBe(400);
  });
  it('400 when channel cannot be resolved', async () => {
    vi.mocked(resolveChannel).mockResolvedValue(null);
    expect((await POST(reqWith({ urlOrHandle: 'nope' }))).status).toBe(400);
  });
  it('201 + upserts as manual on success', async () => {
    vi.mocked(resolveChannel).mockResolvedValue({ channelId: 'UC1', title: 'C1', handle: '@c1', thumbnailUrl: null, subscriberCount: 12000, videoCount: 10, viewCount: 1000, uploadsPlaylistId: 'UU1', publishedAt: null });
    vi.mocked(upsertWatchedChannel).mockResolvedValue({ channel_id: 'UC1' } as never);
    const res = await POST(reqWith({ urlOrHandle: 'https://youtube.com/channel/UC1' }));
    expect(res.status).toBe(201);
    expect(vi.mocked(upsertWatchedChannel)).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ channelId: 'UC1', discoverySource: 'manual' }));
  });
});
