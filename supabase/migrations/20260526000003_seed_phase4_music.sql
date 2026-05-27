-- Phase 4: seed 3 placeholder music tracks so render_f2 has something to mux.
-- These were generated locally with ffmpeg (sine-wave compositions, not real
-- music) and uploaded to Vercel Blob from the developer machine — they're
-- explicitly placeholders that the Phase 5 music import CLI will replace
-- wholesale once a real CC0 library is in place.

insert into public.music_tracks (title, artist, source, requires_attribution, local_path, duration_seconds, genre, energy_level)
values
  ('Ambient Calm (Phase 4 placeholder)', 'phase4_seed', 'creator_commons', false,
    'https://9suuf85koahjignp.public.blob.vercel-storage.com/music/phase4-seed/ambient_calm.mp3', 45, 'ambient', 2),
  ('Cinematic Dread (Phase 4 placeholder)', 'phase4_seed', 'creator_commons', false,
    'https://9suuf85koahjignp.public.blob.vercel-storage.com/music/phase4-seed/cinematic_dread.mp3', 50, 'cinematic', 3),
  ('Electronic Pulse (Phase 4 placeholder)', 'phase4_seed', 'creator_commons', false,
    'https://9suuf85koahjignp.public.blob.vercel-storage.com/music/phase4-seed/electronic_pulse.mp3', 50, 'electronic', 3)
on conflict do nothing;
