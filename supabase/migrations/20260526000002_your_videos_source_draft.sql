-- Phase 4: link your_videos rows back to the compilation_drafts they were
-- promoted from, and let compilation-promoted rows store NULL script
-- (compilations have no narration).

alter table public.your_videos
  add column if not exists source_compilation_draft_id uuid
    references public.compilation_drafts(id) on delete set null;

create index if not exists your_videos_source_draft_idx
  on public.your_videos (source_compilation_draft_id);

alter table public.your_videos
  alter column script drop not null;
