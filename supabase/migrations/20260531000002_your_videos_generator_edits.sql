-- Generator learning-loop signal: operator script edits vs the original draft.
alter table public.your_videos
  add column if not exists generator_edits jsonb;
