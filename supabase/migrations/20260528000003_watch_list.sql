-- Watch-list of small/medium channels we track for outlier velocity (Sub-phase C cron)
create table if not exists public.watched_channels (
  channel_id text primary key,
  channel_handle text,
  channel_title text,
  channel_thumbnail_url text,
  subscriber_count_at_add bigint not null,
  current_subscriber_count bigint not null,
  subscriber_growth_30d numeric(6,3),
  subscriber_growth_90d numeric(6,3),
  outlier_rate_60d numeric(4,3),
  upload_cadence_per_week numeric(5,2),
  added_at timestamptz not null default now(),
  discovery_source text not null check (discovery_source in ('manual','auto_breakout','auto_outlier')),
  is_active boolean not null default true,
  last_snapshotted_at timestamptz
);

create index if not exists watched_channels_active_last_snap_idx
  on public.watched_channels (is_active, last_snapshotted_at nulls first);

-- Per-video daily view-count history
create table if not exists public.video_velocity_snapshots (
  video_id text not null,
  snapshot_at timestamptz not null default now(),
  view_count bigint not null,
  like_count bigint not null default 0,
  comment_count bigint not null default 0,
  primary key (video_id, snapshot_at)
);

create index if not exists video_velocity_snapshots_video_idx
  on public.video_velocity_snapshots (video_id, snapshot_at desc);

-- Competitor channels (operator-curated, for /competitors page)
create table if not exists public.competitor_channels (
  channel_id text primary key,
  channel_handle text,
  channel_title text,
  added_at timestamptz not null default now(),
  is_active boolean not null default true
);
