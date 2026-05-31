-- Per-source ingestion run health (Sub-phase C). Powers /admin/ingestion-health (Sub-phase D).
create table if not exists public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null check (job in (
    'youtube_category_sweep','youtube_shorts_search','watch_list_sync',
    'reddit_topic_discovery','google_trends','tiktok_creative_center'
  )),
  status text not null check (status in ('success','partial','failed','skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  items_ingested integer not null default 0,
  items_skipped integer not null default 0,
  quota_units integer not null default 0,
  error text,
  context jsonb not null default '{}'::jsonb
);

create index if not exists ingestion_runs_job_started_idx
  on public.ingestion_runs (job, started_at desc);
