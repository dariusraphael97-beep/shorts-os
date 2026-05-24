create table public.jobs (
  id uuid primary key default uuid_generate_v4(),
  kind text not null check (kind in ('scrape', 'score_topics', 'produce_video', 'analyze_performance')),
  channel_id uuid references public.channels(id),
  topic_queue_id uuid references public.topic_queue(id),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  current_step text,
  current_agent text references public.agents(id),
  progress_pct int default 0,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index jobs_status_idx on public.jobs (status, created_at desc);
create index jobs_kind_idx on public.jobs (kind);
