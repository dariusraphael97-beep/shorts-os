import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostingSchedule } from "@/lib/timezone";

export type ChannelPersona = {
  niche: string;
  voice: string;
  pov: string;
  style_guide: string;
  forbidden: string[];
};

export type FormatMix = { explainer: number; compilation: number };

export type Channel = {
  id: string;
  slug: string;
  display_name: string;
  platform: "youtube" | "tiktok" | "instagram";
  external_channel_id: string | null;
  oauth_refresh_token_encrypted: string | null;
  niche_id: string | null;
  persona: ChannelPersona;
  default_voice_id: string | null;
  default_tts_provider: "cartesia" | "elevenlabs" | null;
  is_active: boolean;
  max_uploads_per_day: number;
  target_format_mix: FormatMix;
  timezone: string;
  posting_schedule: PostingSchedule;
  creator_goals: string | null;
  interests: string[];
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function getChannelById(
  supabase: SupabaseClient,
  channelId: string,
): Promise<Channel | null> {
  const { data, error } = await supabase
    .from("channels")
    .select("*")
    .eq("id", channelId)
    .maybeSingle();
  if (error) throw new Error(`getChannelById: ${error.message}`);
  return (data as Channel | null) ?? null;
}

export async function getDefaultChannel(supabase: SupabaseClient): Promise<Channel> {
  // Single-channel mode: return the only active channel.
  // Phase 1's reseed migration renamed the 'default'-slug seed to per-channel slugs (e.g. 'dyfrx_9754').
  // Plan #4+ stays single-channel until multi-channel selection lands in Plan #5.
  const { data, error } = await supabase
    .from("channels")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (error) throw new Error(`getDefaultChannel: ${error.message}`);
  if (!data) throw new Error("getDefaultChannel: no active channel — did the seed migration run?");
  return data as Channel;
}

import { encryptSecret, decryptSecret, type EncryptedSecret } from '@/lib/encryption';

export async function saveEncryptedRefreshToken(
  supabase: SupabaseClient,
  channelId: string,
  refreshToken: string,
): Promise<void> {
  const blob = encryptSecret(refreshToken);
  const json = JSON.stringify(blob);
  const { error } = await supabase
    .from('channels')
    .update({ oauth_refresh_token_encrypted: json })
    .eq('id', channelId);
  if (error) throw new Error(`saveEncryptedRefreshToken: ${error.message}`);
}

export async function loadEncryptedRefreshToken(
  supabase: SupabaseClient,
  channelId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('channels')
    .select('oauth_refresh_token_encrypted')
    .eq('id', channelId)
    .single();
  if (error) throw new Error(`loadEncryptedRefreshToken: ${error.message}`);
  const raw = (data as { oauth_refresh_token_encrypted: string | null }).oauth_refresh_token_encrypted;
  if (!raw) return null;
  const blob = JSON.parse(raw) as EncryptedSecret;
  return decryptSecret(blob);
}

export async function isYouTubeConnected(
  supabase: SupabaseClient,
  channelId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('channels')
    .select('oauth_refresh_token_encrypted')
    .eq('id', channelId)
    .single();
  if (error) throw new Error(`isYouTubeConnected: ${error.message}`);
  return (data as { oauth_refresh_token_encrypted: string | null }).oauth_refresh_token_encrypted != null;
}

export type CreatorGoal = "monetize" | "grow_subscribers" | "test_niche" | "other";

export async function saveOnboarding(
  supabase: SupabaseClient,
  params: { channelId: string; creatorGoals: CreatorGoal; interests: string[] },
): Promise<void> {
  const { error } = await supabase
    .from("channels")
    .update({ creator_goals: params.creatorGoals, interests: params.interests })
    .eq("id", params.channelId);
  if (error) throw new Error(`saveOnboarding: ${error.message}`);
}

export async function markOnboardingComplete(
  supabase: SupabaseClient,
  channelId: string,
): Promise<void> {
  const { error } = await supabase
    .from("channels")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", channelId);
  if (error) throw new Error(`markOnboardingComplete: ${error.message}`);
}
