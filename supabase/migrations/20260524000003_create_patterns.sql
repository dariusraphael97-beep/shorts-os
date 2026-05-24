create table public.patterns (
  id uuid primary key default uuid_generate_v4(),
  niche_id uuid references public.niches(id) on delete cascade,
  kind text not null check (kind in ('hook', 'length', 'b_roll_cadence', 'caption_style', 'audio_type', 'title_format')),
  value jsonb not null,
  example_observation_ids uuid[] not null default '{}',
  win_count int not null default 0,
  total_count int not null default 0,
  win_rate_pct numeric generated always as (case when total_count > 0 then (win_count::numeric / total_count) * 100 else 0 end) stored,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (niche_id, kind, value)
);

create index patterns_niche_kind_idx on public.patterns (niche_id, kind);
create index patterns_winrate_idx on public.patterns (win_rate_pct desc);

comment on table public.patterns is 'Aggregated winning patterns per niche, updated by the Pattern Loop.';
