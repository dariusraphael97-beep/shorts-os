create table public.agents (
  id text primary key,  -- 'strategist', 'scout', 'archivist', 'writer', 'director', 'voice_coach', 'analyst'
  display_name text not null,
  emoji text,
  description text not null,
  prompt_template text not null,
  prompt_version int not null default 1,
  model_id text not null default 'claude-haiku-4-5',
  is_active boolean not null default true,
  total_decisions int not null default 0,
  total_wins int not null default 0,
  current_state text not null default 'idle' check (current_state in ('idle', 'thinking', 'working', 'awaiting_input')),
  current_task text,
  updated_at timestamptz not null default now()
);

create table public.agent_prompt_versions (
  id uuid primary key default uuid_generate_v4(),
  agent_id text not null references public.agents(id) on delete cascade,
  version int not null,
  prompt_template text not null,
  changelog text,
  created_at timestamptz not null default now(),
  unique (agent_id, version)
);
