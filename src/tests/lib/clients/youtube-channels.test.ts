import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchChannels, fetchPlaylistItems, resolveChannel } from '@/lib/clients/youtube';

afterEach(() => vi.restoreAllMocks());

const channelItem = {
  id: 'UCabc',
  snippet: { title: 'FactBlast', thumbnails: { default: { url: 'https://t/c.jpg' } }, customUrl: '@factblast' },
  statistics: { subscriberCount: '120000', videoCount: '340', viewCount: '9000000' },
  contentDetails: { relatedPlaylists: { uploads: 'UUabc' } },
};

describe('fetchChannels', () => {
  it('maps channels.list items and batches ≤50', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(
      () => Promise.resolve(new Response(JSON.stringify({ items: [channelItem] }), { status: 200 }) as Response),
    );
    const ids = Array.from({ length: 60 }, (_, i) => `UC${i}`);
    const result = await fetchChannels({ apiKey: 'k', channelIds: ids });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result[0]).toMatchObject({
      channelId: 'UCabc', title: 'FactBlast', subscriberCount: 120000,
      videoCount: 340, viewCount: 9000000, uploadsPlaylistId: 'UUabc',
    });
  });

  it('returns [] for empty input', async () => {
    expect(await fetchChannels({ apiKey: 'k', channelIds: [] })).toEqual([]);
  });

  it('maps channel publishedAt (creation date) from snippet', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        items: [{ id: 'UC1', snippet: { title: 'T', publishedAt: '2026-03-01T00:00:00Z' }, statistics: { subscriberCount: '100' } }],
      }), { status: 200 }) as Response,
    );
    const [c] = await fetchChannels({ apiKey: 'K', channelIds: ['UC1'] });
    expect(c.publishedAt).toBe('2026-03-01T00:00:00Z');
  });
});

describe('fetchPlaylistItems', () => {
  it('maps playlistItems.list contentDetails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [{ contentDetails: { videoId: 'v1', videoPublishedAt: '2026-05-25T00:00:00Z' } }] }), { status: 200 }) as Response,
    );
    const result = await fetchPlaylistItems({ apiKey: 'k', playlistId: 'UUabc' });
    expect(result).toEqual([{ videoId: 'v1', publishedAt: '2026-05-25T00:00:00Z' }]);
  });
});

describe('resolveChannel', () => {
  it('resolves a /channel/<id> URL via fetchChannels', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [channelItem] }), { status: 200 }) as Response,
    );
    const result = await resolveChannel({ apiKey: 'k', urlOrHandle: 'https://www.youtube.com/channel/UCabc' });
    expect(result?.channelId).toBe('UCabc');
  });

  it('resolves an @handle via forHandle', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [channelItem] }), { status: 200 }) as Response,
    );
    const result = await resolveChannel({ apiKey: 'k', urlOrHandle: '@factblast' });
    expect(String(fetchMock.mock.calls[0][0])).toContain('forHandle=%40factblast');
    expect(result?.channelId).toBe('UCabc');
  });
});
