create table public.agent_messages (
  id uuid primary key default uuid_generate_v4(),
  from_agent text references public.agents(id),
  to_agent text references public.agents(id),
  job_id uuid,
  intent text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index agent_msg_job_idx on public.agent_messages (job_id, created_at);
create index agent_msg_recent_idx on public.agent_messages (created_at desc);
