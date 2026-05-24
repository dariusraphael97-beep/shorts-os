create table public.channels (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  display_name text not null,
  platform text not null check (platform in ('youtube', 'tiktok', 'instagram')),
  external_channel_id text,
  niche_id uuid references public.niches(id),
  persona jsonb not null default '{}'::jsonb,
  default_voice_id text,
  default_tts_provider text default 'cartesia' check (default_tts_provider in ('cartesia', 'elevenlabs')),
  oauth_refresh_token_encrypted text,
  is_active boolean not null default true,
  max_uploads_per_day int not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index channels_active_platform_idx on public.channels (is_active, platform);

comment on table public.channels is 'Channels the operator publishes to. OAuth tokens encrypted at rest.';
