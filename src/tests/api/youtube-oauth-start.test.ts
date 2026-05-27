import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));
vi.mock('@/lib/supabase/repositories/youtube-oauth-state', () => ({
  insertOAuthState: vi.fn(),
}));
vi.mock('@/lib/supabase/repositories/channels', () => ({
  getDefaultChannel: vi.fn(),
}));

import { GET } from '@/app/api/youtube/oauth/start/route';
import { getServiceClient } from '@/lib/supabase/server';
import { insertOAuthState } from '@/lib/supabase/repositories/youtube-oauth-state';
import { getDefaultChannel } from '@/lib/supabase/repositories/channels';

describe('GET /api/youtube/oauth/start', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'test-client-id');
    vi.mocked(getServiceClient).mockReturnValue({} as never);
    vi.mocked(getDefaultChannel).mockResolvedValue({ id: 'chan-1' } as never);
    vi.mocked(insertOAuthState).mockResolvedValue('STATE_ABCD_32_CHARS_EXACTLY________');
  });

  it('302-redirects to Google consent URL with all required params', async () => {
    const req = new Request('https://app.example.com/api/youtube/oauth/start');
    const res = await GET(req);
    expect(res.status).toBe(307); // NextResponse.redirect default
    const location = res.headers.get('location') ?? '';
    const u = new URL(location);
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(u.searchParams.get('client_id')).toBe('test-client-id');
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('prompt')).toBe('consent');
    expect(u.searchParams.get('state')).toBe('STATE_ABCD_32_CHARS_EXACTLY________');
    expect(u.searchParams.get('redirect_uri')).toBe('https://app.example.com/api/youtube/oauth/callback');
    const scope = u.searchParams.get('scope') ?? '';
    expect(scope).toContain('https://www.googleapis.com/auth/youtube.upload');
    expect(scope).toContain('https://www.googleapis.com/auth/youtube.readonly');
    expect(scope).toContain('https://www.googleapis.com/auth/yt-analytics.readonly');
  });

  it('500s when GOOGLE_OAUTH_CLIENT_ID is missing', async () => {
    vi.unstubAllEnvs();
    const res = await GET(new Request('https://app.example.com/api/youtube/oauth/start'));
    expect(res.status).toBe(500);
  });
});
