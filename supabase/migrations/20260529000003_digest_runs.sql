-- Weekly digest send/preview history (Plan #5 Sub-phase E).
create table if not exists public.digest_runs (
  id          uuid primary key default gen_random_uuid(),
  week_start  date not null,
  sent_at     timestamptz not null default now(),
  recipient   text,
  status      text not null check (status in ('sent','skipped','failed','preview')),
  cluster_ids jsonb not null default '[]'::jsonb,
  html        text,
  error       text
);
create index if not exists digest_runs_week_idx on public.digest_runs (week_start, sent_at desc);
