import { describe, it, expect, vi, afterEach } from 'vitest';
import { exchangeCodeForTokens, refreshAccessToken, GoogleTokenError } from '@/lib/clients/google-oauth';

const ORIGINAL_FETCH = globalThis.fetch;
afterEach(() => { globalThis.fetch = ORIGINAL_FETCH; });

describe('google-oauth client', () => {
  it('exchangeCodeForTokens posts to token endpoint and returns parsed tokens', async () => {
    globalThis.fetch = vi.fn(async (url: URL | string, init?: RequestInit) => {
      expect(String(url)).toBe('https://oauth2.googleapis.com/token');
      expect(init?.method).toBe('POST');
      const body = (init?.body as URLSearchParams);
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('code')).toBe('AUTH-CODE');
      expect(body.get('client_id')).toBe('cid');
      expect(body.get('client_secret')).toBe('csecret');
      expect(body.get('redirect_uri')).toBe('https://x/cb');
      return new Response(JSON.stringify({
        access_token: 'AT', refresh_token: 'RT', expires_in: 3599, scope: 'a b', token_type: 'Bearer',
      }), { status: 200 });
    }) as never;

    const result = await exchangeCodeForTokens({
      code: 'AUTH-CODE', clientId: 'cid', clientSecret: 'csecret', redirectUri: 'https://x/cb',
    });
    expect(result.accessToken).toBe('AT');
    expect(result.refreshToken).toBe('RT');
    expect(result.expiresIn).toBe(3599);
  });

  it('exchangeCodeForTokens throws GoogleTokenError on non-200', async () => {
    globalThis.fetch = vi.fn(async () => new Response('bad_verifier', { status: 400 })) as never;
    await expect(
      exchangeCodeForTokens({ code: 'x', clientId: 'c', clientSecret: 's', redirectUri: 'u' }),
    ).rejects.toThrow(GoogleTokenError);
  });

  it('refreshAccessToken posts grant_type=refresh_token', async () => {
    globalThis.fetch = vi.fn(async (_url, init) => {
      const body = (init?.body as URLSearchParams);
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('RT');
      return new Response(JSON.stringify({ access_token: 'AT2', expires_in: 3599 }), { status: 200 });
    }) as never;

    const result = await refreshAccessToken({
      refreshToken: 'RT', clientId: 'c', clientSecret: 's',
    });
    expect(result.accessToken).toBe('AT2');
    expect(result.expiresIn).toBe(3599);
  });
});
