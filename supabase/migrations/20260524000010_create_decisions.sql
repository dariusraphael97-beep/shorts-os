create table public.decisions (
  id uuid primary key default uuid_generate_v4(),
  agent_id text references public.agents(id),
  job_id uuid,
  decision_type text not null,
  inputs jsonb not null,
  alternatives jsonb not null default '[]'::jsonb,
  chosen jsonb not null,
  scores jsonb,
  reasoning text,
  outcome jsonb,
  outcome_recorded_at timestamptz,
  created_at timestamptz not null default now()
);

create index decisions_agent_recent_idx on public.decisions (agent_id, created_at desc);
create index decisions_job_idx on public.decisions (job_id);
