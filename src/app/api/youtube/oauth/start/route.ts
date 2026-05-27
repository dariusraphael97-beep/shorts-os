import 'server-only';
import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { getDefaultChannel } from '@/lib/supabase/repositories/channels';
import { insertOAuthState } from '@/lib/supabase/repositories/youtube-oauth-state';

export const dynamic = 'force-dynamic';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
];

export async function GET(req: Request): Promise<Response> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'GOOGLE_OAUTH_CLIENT_ID not configured' }, { status: 500 });
  }

  const supabase = getServiceClient();
  const channel = await getDefaultChannel(supabase);
  const state = await insertOAuthState(supabase, channel.id);

  const redirectUri = new URL('/api/youtube/oauth/callback', req.url).toString();
  const consent = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  consent.searchParams.set('client_id', clientId);
  consent.searchParams.set('redirect_uri', redirectUri);
  consent.searchParams.set('response_type', 'code');
  consent.searchParams.set('access_type', 'offline');
  consent.searchParams.set('prompt', 'consent');
  consent.searchParams.set('scope', SCOPES.join(' '));
  consent.searchParams.set('state', state);
  return NextResponse.redirect(consent.toString());
}
