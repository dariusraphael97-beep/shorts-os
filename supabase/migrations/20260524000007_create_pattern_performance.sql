create table public.pattern_performance (
  id uuid primary key default uuid_generate_v4(),
  pattern_id uuid not null references public.patterns(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  videos_using_pattern int not null default 0,
  avg_retention_pct numeric,
  avg_views bigint,
  avg_ctr_pct numeric,
  computed_at timestamptz not null default now(),
  unique (pattern_id, channel_id)
);
