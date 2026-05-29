-- Channel persona (intro/outro/voice/captions). Phase 2 populates rows + adds repo helpers.
create table if not exists public.channel_personas (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  intro_template jsonb not null default '{}'::jsonb,
  outro_template jsonb not null default '{}'::jsonb,
  voice_profile jsonb not null default '{}'::jsonb,
  brand_watermark_url text,
  caption_style jsonb not null default '{}'::jsonb,
  signature_phrases text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_id)
);
