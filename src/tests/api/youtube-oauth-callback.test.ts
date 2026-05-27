import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));
vi.mock('@/lib/supabase/repositories/youtube-oauth-state', () => ({
  consumeOAuthState: vi.fn(),
  OAuthStateError: class OAuthStateError extends Error {},
}));
vi.mock('@/lib/supabase/repositories/channels', () => ({
  saveEncryptedRefreshToken: vi.fn(),
}));
vi.mock('@/lib/clients/google-oauth', () => ({
  exchangeCodeForTokens: vi.fn(),
  GoogleTokenError: class GoogleTokenError extends Error {},
}));

import { GET } from '@/app/api/youtube/oauth/callback/route';
import { consumeOAuthState } from '@/lib/supabase/repositories/youtube-oauth-state';
import { saveEncryptedRefreshToken } from '@/lib/supabase/repositories/channels';
import { exchangeCodeForTokens } from '@/lib/clients/google-oauth';
import { getServiceClient } from '@/lib/supabase/server';

describe('GET /api/youtube/oauth/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'cid');
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'csecret');
    vi.mocked(getServiceClient).mockReturnValue({} as never);
  });

  it('happy path: exchanges code, saves encrypted token, redirects to settings', async () => {
    vi.mocked(consumeOAuthState).mockResolvedValue('chan-1');
    vi.mocked(exchangeCodeForTokens).mockResolvedValue({
      accessToken: 'AT', refreshToken: 'RT', expiresIn: 3599, scope: '',
    });
    vi.mocked(saveEncryptedRefreshToken).mockResolvedValue();
    const res = await GET(new Request('https://app/api/youtube/oauth/callback?code=AUTH&state=STATE'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://app/settings/channel?connected=true');
    expect(vi.mocked(saveEncryptedRefreshToken)).toHaveBeenCalledWith(expect.anything(), 'chan-1', 'RT');
  });

  it('400s if state missing', async () => {
    const res = await GET(new Request('https://app/api/youtube/oauth/callback?code=AUTH'));
    expect(res.status).toBe(400);
  });

  it('400s if code missing', async () => {
    const res = await GET(new Request('https://app/api/youtube/oauth/callback?state=STATE'));
    expect(res.status).toBe(400);
  });

  it('403s on expired state', async () => {
    const { OAuthStateError } = await import('@/lib/supabase/repositories/youtube-oauth-state');
    vi.mocked(consumeOAuthState).mockRejectedValue(new OAuthStateError('expired'));
    const res = await GET(new Request('https://app/api/youtube/oauth/callback?code=AUTH&state=STATE'));
    expect(res.status).toBe(403);
  });

  it('502 on Google token exchange failure', async () => {
    const { GoogleTokenError } = await import('@/lib/clients/google-oauth');
    vi.mocked(consumeOAuthState).mockResolvedValue('chan-1');
    vi.mocked(exchangeCodeForTokens).mockRejectedValue(new GoogleTokenError('boom', 400));
    const res = await GET(new Request('https://app/api/youtube/oauth/callback?code=AUTH&state=STATE'));
    expect(res.status).toBe(502);
  });
});
