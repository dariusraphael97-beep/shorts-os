create extension if not exists "uuid-ossp";

create table public.niches (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  display_name text not null,
  description text,
  is_active boolean not null default true,
  subreddits text[] not null default '{}',
  youtube_search_terms text[] not null default '{}',
  tiktok_hashtags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index niches_active_idx on public.niches (is_active);

comment on table public.niches is 'Operating niches with their source feed configurations.';
