import 'server-only';

export class GoogleTokenError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'GoogleTokenError';
  }
}

export interface ExchangeArgs {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface ExchangeResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
}

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
// Node 24's fetch has no implicit timeout — needed because the worker runs in a
// Vercel Sandbox where a hung token endpoint pins the whole process for 15min.
const TOKEN_FETCH_TIMEOUT_MS = 30_000;

async function fetchToken(body: URLSearchParams, label: string): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TOKEN_FETCH_TIMEOUT_MS);
  try {
    return await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: ac.signal,
    });
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') {
      throw new GoogleTokenError(`${label}: timeout after ${TOKEN_FETCH_TIMEOUT_MS}ms`, 0);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function exchangeCodeForTokens(args: ExchangeArgs): Promise<ExchangeResult> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: args.code,
    client_id: args.clientId,
    client_secret: args.clientSecret,
    redirect_uri: args.redirectUri,
  });
  const res = await fetchToken(body, 'exchangeCodeForTokens');
  if (!res.ok) {
    throw new GoogleTokenError(`exchangeCodeForTokens: ${res.status} ${await res.text()}`, res.status);
  }
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!json.access_token || !json.refresh_token) {
    throw new GoogleTokenError(`exchangeCodeForTokens: malformed token response`, res.status);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in ?? 0,
    scope: json.scope ?? '',
  };
}

export interface RefreshArgs {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}

export interface RefreshResult {
  accessToken: string;
  expiresIn: number;
}

export async function refreshAccessToken(args: RefreshArgs): Promise<RefreshResult> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: args.refreshToken,
    client_id: args.clientId,
    client_secret: args.clientSecret,
  });
  const res = await fetchToken(body, 'refreshAccessToken');
  if (!res.ok) {
    throw new GoogleTokenError(`refreshAccessToken: ${res.status} ${await res.text()}`, res.status);
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new GoogleTokenError(`refreshAccessToken: malformed`, res.status);
  }
  return { accessToken: json.access_token, expiresIn: json.expires_in ?? 0 };
}
