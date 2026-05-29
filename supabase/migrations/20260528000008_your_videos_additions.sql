alter table public.your_videos
  add column if not exists source_niche_cluster_id uuid references public.niche_clusters (id) on delete set null,
  add column if not exists script_brief jsonb,
  add column if not exists review_id uuid references public.video_reviews (id) on delete set null,
  add column if not exists editor_session_id uuid;

-- Note: editor_session_id has no FK constraint in Sub-phase A.
-- Phase 3 creates the editor_sessions table and the FK will be added then.

create index if not exists your_videos_source_niche_cluster_idx
  on public.your_videos (source_niche_cluster_id)
  where source_niche_cluster_id is not null;
