import { describe, it, expect } from 'vitest';
import {
  insertOAuthState,
  consumeOAuthState,
  OAuthStateError,
} from '@/lib/supabase/repositories/youtube-oauth-state';

const CHANNEL_ID = '11111111-1111-1111-1111-111111111111';

function makeStore() {
  const rows = new Map<string, { state: string; channel_id: string; created_at: string }>();
  return {
    rows,
    supabase: {
      from: (table: string) => {
        if (table !== 'youtube_oauth_state') throw new Error(`unexpected table ${table}`);
        return {
          insert: (row: { state: string; channel_id: string }) => {
            rows.set(row.state, { ...row, created_at: new Date().toISOString() });
            return { error: null };
          },
          select: (_cols: string) => ({
            eq: (_col: string, val: string) => ({
              single: async () => {
                const row = rows.get(val);
                return row ? { data: row, error: null } : { data: null, error: { code: 'PGRST116' } };
              },
            }),
          }),
          delete: () => ({
            eq: async (_col: string, val: string) => {
              rows.delete(val);
              return { error: null };
            },
          }),
        };
      },
    } as never,
  };
}

describe('youtube_oauth_state repo', () => {
  it('insertOAuthState writes a 32-char nanoid-style state', async () => {
    const { supabase, rows } = makeStore();
    const state = await insertOAuthState(supabase, CHANNEL_ID);
    expect(state).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(rows.get(state)?.channel_id).toBe(CHANNEL_ID);
  });

  it('consumeOAuthState returns channel_id and deletes the row', async () => {
    const { supabase, rows } = makeStore();
    const state = await insertOAuthState(supabase, CHANNEL_ID);
    const channelId = await consumeOAuthState(supabase, state, new Date());
    expect(channelId).toBe(CHANNEL_ID);
    expect(rows.has(state)).toBe(false);
  });

  it('consumeOAuthState throws OAuthStateError on unknown state', async () => {
    const { supabase } = makeStore();
    await expect(consumeOAuthState(supabase, 'doesnotexist', new Date())).rejects.toThrow(OAuthStateError);
  });

  it('consumeOAuthState throws OAuthStateError when state is older than 10 minutes', async () => {
    const { supabase, rows } = makeStore();
    const state = await insertOAuthState(supabase, CHANNEL_ID);
    const row = rows.get(state)!;
    rows.set(state, { ...row, created_at: new Date(Date.now() - 11 * 60_000).toISOString() });
    await expect(consumeOAuthState(supabase, state, new Date())).rejects.toThrow(/expired/);
  });
});
