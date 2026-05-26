-- supabase/migrations/20260526000001_your_videos_caption_props.sql
alter table public.your_videos
add column if not exists caption_props jsonb;

comment on column public.your_videos.caption_props is
  'Phase 2.5 Director-picked CaptionsPropsSchema for the Remotion overlay render.';
