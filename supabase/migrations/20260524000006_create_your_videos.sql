create table public.your_videos (
  id uuid primary key default uuid_generate_v4(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  topic_queue_id uuid references public.topic_queue(id) on delete set null,
  external_video_id text,
  url text,
  title text not null,
  description text,
  script text not null,
  voice_provider text,
  voice_id text,
  duration_seconds numeric,
  visual_treatment text,
  posted_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'rendering', 'rendered', 'posted', 'failed')),
  render_artifact_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index your_videos_channel_posted_idx on public.your_videos (channel_id, posted_at desc);
create index your_videos_status_idx on public.your_videos (status);

create table public.your_videos_analytics_snapshots (
  id uuid primary key default uuid_generate_v4(),
  video_id uuid not null references public.your_videos(id) on delete cascade,
  snapshot_at timestamptz not null default now(),
  views bigint,
  likes bigint,
  comments bigint,
  avg_view_duration_seconds numeric,
  ctr_pct numeric,
  subscribers_gained int,
  unique (video_id, snapshot_at)
);

create index yv_analytics_video_idx on public.your_videos_analytics_snapshots (video_id, snapshot_at desc);
