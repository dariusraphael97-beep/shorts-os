import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ChannelPersona = {
  niche: string;
  voice: string;
  pov: string;
  style_guide: string;
  forbidden: string[];
};

export type Channel = {
  id: string;
  slug: string;
  display_name: string;
  platform: "youtube" | "tiktok" | "instagram";
  external_channel_id: string | null;
  niche_id: string | null;
  persona: ChannelPersona;
  default_voice_id: string | null;
  default_tts_provider: "cartesia" | "elevenlabs" | null;
  is_active: boolean;
  max_uploads_per_day: number;
  created_at: string;
  updated_at: string;
};

export async function getDefaultChannel(supabase: SupabaseClient): Promise<Channel> {
  const { data, error } = await supabase
    .from("channels")
    .select("*")
    .eq("slug", "default")
    .single();
  if (error) throw new Error(`getDefaultChannel: ${error.message}`);
  if (!data) throw new Error("getDefaultChannel: default channel not found — did the seed migration run?");
  return data as Channel;
}
