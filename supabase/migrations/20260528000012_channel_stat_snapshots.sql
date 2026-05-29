-- Per-channel subscriber/stat time series (Sub-phase C). Supports §4.5 growth + breakout math.
create table if not exists public.channel_stat_snapshots (
  channel_id text not null,
  snapshot_at timestamptz not null default now(),
  subscriber_count bigint not null,
  video_count bigint,
  view_count bigint,
  primary key (channel_id, snapshot_at)
);

create index if not exists channel_stat_snapshots_channel_idx
  on public.channel_stat_snapshots (channel_id, snapshot_at desc);
