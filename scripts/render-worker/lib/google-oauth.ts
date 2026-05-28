// scripts/render-worker/lib/google-oauth.ts
// MIRROR OF src/lib/clients/google-oauth.ts — modulo the removed `server-only` import.
// Drift-checked at test time via src/tests/lib/google-oauth-mirror.test.ts.

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

export async function exchangeCodeForTokens(args: ExchangeArgs): Promise<ExchangeResult> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: args.code,
    client_id: args.clientId,
    client_secret: args.clientSecret,
    redirect_uri: args.redirectUri,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
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
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new GoogleTokenError(`refreshAccessToken: ${res.status} ${await res.text()}`, res.status);
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new GoogleTokenError(`refreshAccessToken: malformed`, res.status);
  }
  return { accessToken: json.access_token, expiresIn: json.expires_in ?? 0 };
}
