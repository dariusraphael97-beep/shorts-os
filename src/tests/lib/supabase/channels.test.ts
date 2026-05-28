import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveEncryptedRefreshToken,
  loadEncryptedRefreshToken,
  type Channel,
} from '@/lib/supabase/repositories/channels';

const KEY_V1 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const CHANNEL_ID = '11111111-1111-1111-1111-111111111111';

describe('channels repo — encrypted refresh token', () => {
  beforeEach(() => {
    vi.stubEnv('OAUTH_TOKEN_ENCRYPTION_KEY_V1', KEY_V1);
    vi.stubEnv('OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION', '1');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('round-trips a refresh token via Supabase update + select', async () => {
    const stored: { oauth_refresh_token_encrypted: string | null } = {
      oauth_refresh_token_encrypted: null,
    };
    const supabase = {
      from: (table: string) => {
        if (table !== 'channels') throw new Error(`unexpected table ${table}`);
        return {
          update: (patch: { oauth_refresh_token_encrypted: string }) => ({
            eq: async (_col: string, _id: string) => {
              stored.oauth_refresh_token_encrypted = patch.oauth_refresh_token_encrypted;
              return { error: null };
            },
          }),
          select: (_cols: string) => ({
            eq: (_col: string, _id: string) => ({
              single: async () => ({ data: stored, error: null }),
            }),
          }),
        };
      },
    } as never;

    await saveEncryptedRefreshToken(supabase, CHANNEL_ID, 'plain-refresh-token-abc123');
    const loaded = await loadEncryptedRefreshToken(supabase, CHANNEL_ID);
    expect(loaded).toBe('plain-refresh-token-abc123');
    expect(stored.oauth_refresh_token_encrypted).not.toBeNull();
    expect(stored.oauth_refresh_token_encrypted!.includes('plain-refresh-token-abc123')).toBe(false);
  });

  it('loadEncryptedRefreshToken returns null when column is empty', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { oauth_refresh_token_encrypted: null }, error: null }),
          }),
        }),
      }),
    } as never;
    const result = await loadEncryptedRefreshToken(supabase, CHANNEL_ID);
    expect(result).toBeNull();
  });

  it('Channel type exposes oauth_refresh_token_encrypted', () => {
    const c: Pick<Channel, 'oauth_refresh_token_encrypted'> = {
      oauth_refresh_token_encrypted: null,
    };
    expect(c.oauth_refresh_token_encrypted).toBeNull();
  });
});
