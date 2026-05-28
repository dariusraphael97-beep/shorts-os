import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../scripts/render-worker/lib/youtube-upload', () => ({
  uploadVideo: vi.fn(),
  YouTubeUploadError: class YouTubeUploadError extends Error {},
}));
vi.mock('../../../../scripts/render-worker/lib/google-oauth', () => ({
  refreshAccessToken: vi.fn(),
  GoogleTokenError: class GoogleTokenError extends Error {},
}));

import { runUpload, UploadHandlerError } from '../../../../scripts/render-worker/handlers/upload';
import { uploadVideo } from '../../../../scripts/render-worker/lib/youtube-upload';
import { refreshAccessToken } from '../../../../scripts/render-worker/lib/google-oauth';
import { encryptSecret } from '../../../../scripts/render-worker/lib/encryption';

const KEY_V1 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const ORIGINAL_FETCH = globalThis.fetch;
afterEach(() => { globalThis.fetch = ORIGINAL_FETCH; });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('OAUTH_TOKEN_ENCRYPTION_KEY_V1', KEY_V1);
  vi.stubEnv('OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION', '1');
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'cid');
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'csecret');
});

function makeEncryptedTokenJSON(plaintext: string): string {
  // Hand-encrypt with the same routine the repo uses, to avoid coupling the test to the helper.
  return JSON.stringify(encryptSecret(plaintext));
}

describe('runUpload handler', () => {
  it('happy path: refresh, download, upload, returns result', async () => {
    const encryptedJSON = makeEncryptedTokenJSON('FAKE_REFRESH_TOKEN');
    const supabase = {
      from: (table: string) => {
        if (table === 'your_videos') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: 'video-1',
                    channel_id: 'chan-1',
                    title: 'Title',
                    description: 'Desc',
                    render_artifact_url: 'https://blob.example.com/video.mp4',
                  },
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
                  data: { oauth_refresh_token_encrypted: encryptedJSON },
                  error: null,
                }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as never;

    globalThis.fetch = vi.fn(async () =>
      new Response(new Uint8Array([0xff, 0xfe]).buffer, { status: 200 }),
    ) as never;
    vi.mocked(refreshAccessToken).mockResolvedValue({ accessToken: 'AT', expiresIn: 3599 });
    vi.mocked(uploadVideo).mockResolvedValue({ externalVideoId: 'EXT123', url: 'https://www.youtube.com/shorts/EXT123' });

    const result = await runUpload({ id: 'job-1', payload: { your_video_id: 'video-1' } }, supabase);
    expect(result.external_video_id).toBe('EXT123');
    expect(result.url).toBe('https://www.youtube.com/shorts/EXT123');
    expect(result.your_video_id).toBe('video-1');
    expect(vi.mocked(refreshAccessToken)).toHaveBeenCalledWith(expect.objectContaining({ refreshToken: 'FAKE_REFRESH_TOKEN' }));
  });

  it('throws UploadHandlerError when channel has no refresh token', async () => {
    const supabase = {
      from: (table: string) => {
        if (table === 'your_videos') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { id: 'video-1', channel_id: 'chan-1', title: 'T', render_artifact_url: 'https://b/v.mp4' },
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
                single: async () => ({ data: { oauth_refresh_token_encrypted: null }, error: null }),
              }),
            }),
          };
        }
        throw new Error('x');
      },
    } as never;
    await expect(runUpload({ id: 'j', payload: { your_video_id: 'video-1' } }, supabase)).rejects.toThrow(UploadHandlerError);
  });

  it('throws UploadHandlerError when payload.your_video_id missing', async () => {
    const supabase = {} as never;
    await expect(runUpload({ id: 'j', payload: {} }, supabase)).rejects.toThrow(/your_video_id/);
  });
});
