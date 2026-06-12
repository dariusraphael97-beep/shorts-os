import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchVideoIds } from '@/lib/clients/youtube';
const ORIGINAL_FETCH = globalThis.fetch;
afterEach(() => { globalThis.fetch = ORIGINAL_FETCH; });

describe('searchVideoIds', () => {
  it('queries search.list with the longform params and returns video ids', async () => {
    let url = '';
    globalThis.fetch = vi.fn(async (u: URL | string) => {
      url = String(u);
      return new Response(JSON.stringify({ items: [
        { id: { videoId: 'A' } }, { id: { videoId: 'B' } }, { id: {} },
      ] }), { status: 200 });
    }) as never;
    const ids = await searchVideoIds({ query: 'backyard birds', apiKey: 'K', videoDuration: 'medium', order: 'viewCount', publishedAfter: '2026-02-01T00:00:00Z', maxResults: 50 });
    const p = new URL(url).searchParams;
    expect(p.get('type')).toBe('video');
    expect(p.get('videoDuration')).toBe('medium');
    expect(p.get('order')).toBe('viewCount');
    expect(p.get('publishedAfter')).toBe('2026-02-01T00:00:00Z');
    expect(p.get('q')).toBe('backyard birds');
    expect(ids).toEqual(['A', 'B']);   // empty id objects dropped
  });
});
