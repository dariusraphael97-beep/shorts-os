// Imports the worker-side file directly via relative path — that's the file the test guards.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { uploadVideo, YouTubeUploadError } from '../../../../scripts/render-worker/lib/youtube-upload';

const ORIGINAL_FETCH = globalThis.fetch;
afterEach(() => { globalThis.fetch = ORIGINAL_FETCH; });

describe('youtube-upload helper', () => {
  it('happy path: 1) initiates resumable session, 2) uploads bytes, 3) parses response', async () => {
    const calls: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
    globalThis.fetch = vi.fn(async (url: URL | string, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url: u, method, headers });
      if (u.includes('uploads?uploadType=resumable')) {
        return new Response(null, {
          status: 200,
          headers: { location: 'https://upload.example.com/RESUMABLE_SESSION' },
        });
      }
      if (u === 'https://upload.example.com/RESUMABLE_SESSION') {
        return new Response(JSON.stringify({ id: 'EXTERNAL_VIDEO_ID', snippet: { title: 'T' } }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as never;

    const result = await uploadVideo({
      accessToken: 'AT',
      videoBytes: new Uint8Array([1, 2, 3, 4]),
      title: 'T',
      description: 'D',
      tags: ['cars'],
      privacyStatus: 'public',
      madeForKids: false,
      categoryId: '24',
    });

    expect(result.externalVideoId).toBe('EXTERNAL_VIDEO_ID');
    expect(result.url).toBe('https://www.youtube.com/shorts/EXTERNAL_VIDEO_ID');
    expect(calls[0].url).toContain('videos?uploadType=resumable');
    expect(calls[0].headers['Authorization']).toBe('Bearer AT');
    const initBody = calls[0];
    expect(initBody.method).toBe('POST');
    expect(calls[1].method).toBe('PUT');
    expect(calls[1].headers['Content-Type']).toBe('video/mp4');
  });

  it('throws YouTubeUploadError on quotaExceeded', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: 403, message: 'quotaExceeded' } }), { status: 403 }),
    ) as never;
    await expect(
      uploadVideo({
        accessToken: 'AT', videoBytes: new Uint8Array(), title: 'T', description: 'D',
        tags: [], privacyStatus: 'public', madeForKids: false, categoryId: '24',
      }),
    ).rejects.toThrow(YouTubeUploadError);
  });
});
