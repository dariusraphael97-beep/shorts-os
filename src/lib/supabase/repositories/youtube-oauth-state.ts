import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const STATE_TTL_MS = 10 * 60 * 1000;

export class OAuthStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OAuthStateError';
  }
}

function generateState(): string {
  // 32 chars of base64url (~24 bytes raw entropy) — matches the spec's nanoid(32) shape.
  return randomBytes(24).toString('base64url').slice(0, 32);
}

export async function insertOAuthState(
  supabase: SupabaseClient,
  channelId: string,
): Promise<string> {
  const state = generateState();
  const { error } = await supabase
    .from('youtube_oauth_state')
    .insert({ state, channel_id: channelId });
  if (error) throw new Error(`insertOAuthState: ${error.message}`);
  return state;
}

export async function consumeOAuthState(
  supabase: SupabaseClient,
  state: string,
  now: Date,
): Promise<string> {
  const { data, error } = await supabase
    .from('youtube_oauth_state')
    .select('channel_id, created_at')
    .eq('state', state)
    .single();
  if (error || !data) throw new OAuthStateError('unknown or expired state');
  const row = data as { channel_id: string; created_at: string };
  const age = now.getTime() - new Date(row.created_at).getTime();
  if (age > STATE_TTL_MS) {
    await supabase.from('youtube_oauth_state').delete().eq('state', state);
    throw new OAuthStateError(`state expired (age ${Math.round(age / 1000)}s)`);
  }
  // Single-use: delete now even though we return the channel id.
  await supabase.from('youtube_oauth_state').delete().eq('state', state);
  return row.channel_id;
}
