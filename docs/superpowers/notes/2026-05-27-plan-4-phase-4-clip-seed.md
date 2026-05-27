# Plan #4 Phase 4 — Placeholder clip_library seed

The Phase 4 smoke needs ≥5 clip_library rows in the active channel's niche so
Composer has something to assemble. Since real Reddit ingest is dead (Option A
confirmed dead in Task 3) and YouTube cookies remain untested, the agent
generated 7 placeholder vertical mp4s locally with ffmpeg-static, uploaded
them to Vercel Blob, and inserted the rows below directly via Supabase MCP.

These are **not** part of the supabase/migrations/ tree because the local_path
URLs are specific to this operator's Vercel Blob store (`9suuf85koahjignp.public.blob.vercel-storage.com`).
Anyone re-running this on a different Vercel project would need to regenerate +
re-upload + re-seed.

## How they were generated

ffmpeg-static (the binary the worker ships with, which has drawtext) drew a
labeled, numbered, 12s solid-color vertical clip per entry:

```
1: Red    | Drift Fail
2: White  | Garage Win
3: Cyan   | Street Reaction
4: Blue   | Mechanic Save
5: Navy   | Race Highlight
6: Orange | Park Disaster
7: Teal   | Build Reveal
```

Each was uploaded to `clip-library/phase4-seed/clip_N.mp4` in Vercel Blob.

## The seed SQL (for reproducibility)

```sql
insert into public.clip_library
  (source_url, source_platform, source_creator, local_path, duration_seconds, width, height, description, tags, niche_id, added_by)
values
  ('https://placeholder.test/clip_1', 'upload', 'phase4_seed',
   'https://9suuf85koahjignp.public.blob.vercel-storage.com/clip-library/phase4-seed/clip_1.mp4',
   12, 1080, 1920,
   'Red placeholder clip. Drift fail moment — car loses traction in a corner and slides into the curb.',
   ARRAY['cars','drift','fail','crash','street','highlight'],
   'c151f4fa-0e49-4379-a21b-d452d4bdab22', 'manual'),
  ('https://placeholder.test/clip_2', 'upload', 'phase4_seed',
   'https://9suuf85koahjignp.public.blob.vercel-storage.com/clip-library/phase4-seed/clip_2.mp4',
   12, 1080, 1920,
   'White placeholder clip. Garage win — mechanic completes a tricky engine swap on time.',
   ARRAY['cars','garage','mechanic','win','build','reveal'],
   'c151f4fa-0e49-4379-a21b-d452d4bdab22', 'manual'),
  ('https://placeholder.test/clip_3', 'upload', 'phase4_seed',
   'https://9suuf85koahjignp.public.blob.vercel-storage.com/clip-library/phase4-seed/clip_3.mp4',
   12, 1080, 1920,
   'Cyan placeholder clip. Street reaction — pedestrian flinches as a tuned car revs past.',
   ARRAY['cars','street','reaction','tuned','exhaust','funny'],
   'c151f4fa-0e49-4379-a21b-d452d4bdab22', 'manual'),
  ('https://placeholder.test/clip_4', 'upload', 'phase4_seed',
   'https://9suuf85koahjignp.public.blob.vercel-storage.com/clip-library/phase4-seed/clip_4.mp4',
   12, 1080, 1920,
   'Blue placeholder clip. Mechanic save — last-second fix prevents a wheel from coming off mid-roll.',
   ARRAY['cars','mechanic','save','dramatic','close_call','garage'],
   'c151f4fa-0e49-4379-a21b-d452d4bdab22', 'manual'),
  ('https://placeholder.test/clip_5', 'upload', 'phase4_seed',
   'https://9suuf85koahjignp.public.blob.vercel-storage.com/clip-library/phase4-seed/clip_5.mp4',
   12, 1080, 1920,
   'Navy placeholder clip. Race highlight — late-braking overtake on the inside line.',
   ARRAY['cars','race','overtake','highlight','track','speed'],
   'c151f4fa-0e49-4379-a21b-d452d4bdab22', 'manual'),
  ('https://placeholder.test/clip_6', 'upload', 'phase4_seed',
   'https://9suuf85koahjignp.public.blob.vercel-storage.com/clip-library/phase4-seed/clip_6.mp4',
   12, 1080, 1920,
   'Orange placeholder clip. Park disaster — bumper-tap that escalates into a full reverse-back.',
   ARRAY['cars','parking','disaster','fail','reverse','street'],
   'c151f4fa-0e49-4379-a21b-d452d4bdab22', 'manual'),
  ('https://placeholder.test/clip_7', 'upload', 'phase4_seed',
   'https://9suuf85koahjignp.public.blob.vercel-storage.com/clip-library/phase4-seed/clip_7.mp4',
   12, 1080, 1920,
   'Teal placeholder clip. Build reveal — covers come off a restored classic for the first time.',
   ARRAY['cars','build','reveal','restored','classic','project'],
   'c151f4fa-0e49-4379-a21b-d452d4bdab22', 'manual')
on conflict (source_url) do nothing;
```

Cleanup once real ingest is back online:

```sql
update public.clip_library set added_by='deleted' where source_creator='phase4_seed';
```
