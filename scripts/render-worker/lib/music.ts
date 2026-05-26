// scripts/render-worker/lib/music.ts
//
// Picks an ambient/cinematic, no-attribution, low-energy music track from
// music_tracks. If table is empty, returns null and the handler renders
// without a music bed (Phase 2 is best-effort music until Phase 5 CLI ships).
import { writeFile } from 'node:fs/promises';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface DownloadedMusic {
  outputPath: string;
  musicTrackId: string;
}

export async function pickAndDownloadMusic(args: {
  supabase: SupabaseClient;
  outputPath: string;
}): Promise<DownloadedMusic | null> {
  const { data, error } = await args.supabase
    .from('music_tracks')
    .select('id, local_path')
    .in('genre', ['ambient', 'cinematic'])
    .eq('requires_attribution', false)
    .in('energy_level', [2, 3])
    .order('added_at', { ascending: false })
    .limit(1)
    .single();
  if (error || !data) return null;

  const res = await fetch(data.local_path);
  if (!res.ok) {
    console.warn(`music download failed ${res.status}; rendering without music bed`);
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(args.outputPath, buf);
  return { outputPath: args.outputPath, musicTrackId: data.id };
}
