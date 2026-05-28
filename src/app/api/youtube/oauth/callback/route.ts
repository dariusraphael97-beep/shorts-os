import 'server-only';
import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import {
  consumeOAuthState,
  OAuthStateError,
} from '@/lib/supabase/repositories/youtube-oauth-state';
import { saveEncryptedRefreshToken } from '@/lib/supabase/repositories/channels';
import {
  exchangeCodeForTokens,
  GoogleTokenError,
} from '@/lib/clients/google-oauth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errParam = url.searchParams.get('error');

  if (errParam) {
    return NextResponse.redirect(new URL(`/settings/channel?error=${encodeURIComponent(errParam)}`, req.url));
  }
  if (!code || !state) {
    return NextResponse.json({ error: 'missing_code_or_state' }, { status: 400 });
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'oauth_env_missing' }, { status: 500 });
  }

  const supabase = getServiceClient();
  let channelId: string;
  try {
    channelId = await consumeOAuthState(supabase, state, new Date());
  } catch (err) {
    if (err instanceof OAuthStateError) {
      return NextResponse.json({ error: 'invalid_state', detail: err.message }, { status: 403 });
    }
    throw err;
  }

  const redirectUri = new URL('/api/youtube/oauth/callback', req.url).toString();
  let tokens;
  try {
    tokens = await exchangeCodeForTokens({ code, clientId, clientSecret, redirectUri });
  } catch (err) {
    if (err instanceof GoogleTokenError) {
      return NextResponse.json({ error: 'token_exchange_failed', detail: err.message }, { status: 502 });
    }
    throw err;
  }

  await saveEncryptedRefreshToken(supabase, channelId, tokens.refreshToken);
  return NextResponse.redirect(new URL('/settings/channel?connected=true', req.url));
}
