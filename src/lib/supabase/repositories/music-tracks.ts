import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface MusicTrack {
  id: string;
  title: string;
  artist: string | null;
  local_path: string;
  duration_seconds: number | null;
  genre: string | null;
  energy_level: number | null;
}

export async function pickAmbientCinematicTrack(
  supabase: SupabaseClient,
): Promise<MusicTrack | null> {
  const { data, error } = await supabase
    .from("music_tracks")
    .select("id,title,artist,local_path,duration_seconds,genre,energy_level")
    .in("genre", ["ambient", "cinematic"])
    .eq("requires_attribution", false)
    .in("energy_level", [2, 3])
    .order("added_at", { ascending: false })
    .limit(1)
    .single();
  if (error) {
    // PGRST116 = "no rows returned" from .single(). Treat as "no track available".
    if (error.code === "PGRST116") return null;
    return null;
  }
  return data as MusicTrack;
}
