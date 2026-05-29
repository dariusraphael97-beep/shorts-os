-- Plan #5 user-facing product assistants (Niche Scout, Generator, Reviewer, Analyst, Editor Co-pilot, Watch-list Curator).
-- Distinct from Plan #4's `agents` table (script-pipeline workers — strategist, scout, writer, director, voice_coach).
-- Seeded by 20260528000010_seed_assistants.sql.
create table if not exists public.assistants (
  id text primary key,
  display_name text not null,
  role_description text not null,
  icon_name text not null,
  accent_color_var text not null default '--accent',
  is_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.assistant_status (
  assistant_id text primary key references public.assistants (id) on delete cascade,
  state text not null check (state in ('idle','working','waiting','errored')),
  current_activity text,
  updated_at timestamptz not null default now()
);

create table if not exists public.assistant_activity_log (
  id uuid primary key default gen_random_uuid(),
  assistant_id text not null references public.assistants (id) on delete cascade,
  activity_type text not null,
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists assistant_activity_log_assistant_created_idx
  on public.assistant_activity_log (assistant_id, created_at desc);

create table if not exists public.assistant_memory (
  id uuid primary key default gen_random_uuid(),
  assistant_id text not null references public.assistants (id) on delete cascade,
  memory_key text not null,
  memory_value jsonb not null,
  confidence numeric(4,3) not null default 0.5,
  last_updated_at timestamptz not null default now(),
  editable_by_user boolean not null default true,
  unique (assistant_id, memory_key)
);

create index if not exists assistant_memory_assistant_idx
  on public.assistant_memory (assistant_id);

create table if not exists public.assistant_settings (
  assistant_id text primary key references public.assistants (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.assistant_chat_threads (
  id uuid primary key default gen_random_uuid(),
  assistant_id text not null references public.assistants (id) on delete cascade,
  started_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  title text
);

create index if not exists assistant_chat_threads_assistant_idx
  on public.assistant_chat_threads (assistant_id, last_message_at desc);

create table if not exists public.assistant_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.assistant_chat_threads (id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists assistant_chat_messages_thread_created_idx
  on public.assistant_chat_messages (thread_id, created_at asc);
