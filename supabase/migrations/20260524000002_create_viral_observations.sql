create table public.viral_observations (
  id uuid primary key default uuid_generate_v4(),
  niche_id uuid references public.niches(id) on delete set null,
  source text not null check (source in ('youtube', 'tiktok', 'reddit', 'instagram')),
  external_id text not null,
  url text not null,
  title text,
  channel_name text,
  channel_id text,
  views bigint,
  likes bigint,
  comments bigint,
  duration_seconds int,
  observed_at timestamptz not null default now(),
  views_at_observation bigint,
  hook_text text,
  hook_seconds_estimate numeric,
  raw_payload jsonb not null,
  unique (source, external_id, observed_at)
);

create index viral_obs_niche_observed_idx on public.viral_observations (niche_id, observed_at desc);
create index viral_obs_source_idx on public.viral_observations (source);

comment on table public.viral_observations is 'Every viral short the Trending Radar has scraped, with snapshots over time.';
