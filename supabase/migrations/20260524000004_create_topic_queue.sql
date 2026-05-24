create table public.topic_queue (
  id uuid primary key default uuid_generate_v4(),
  niche_id uuid references public.niches(id) on delete cascade,
  source text not null check (source in ('reddit', 'wikipedia', 'news', 'manual')),
  external_ref text,
  title text not null,
  summary text,
  raw_payload jsonb not null,
  hookability_score numeric,
  scored_at timestamptz,
  state text not null default 'queued' check (state in ('queued', 'reviewed', 'used', 'rejected')),
  used_for_video_id uuid,
  rejected_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index topic_queue_niche_state_idx on public.topic_queue (niche_id, state, hookability_score desc nulls last);

comment on table public.topic_queue is 'Candidate topics surfaced by Source Harvester, scored by Claude, consumed by Strategist.';
