-- supabase/migrations/20260525000002_plan_4_schema.sql
--
-- Plan #4 schema. Adds the render queue, clip library, compilation drafts,
-- music tracks, scheduling, operator alerts, ingest blocklist, OAuth state.
-- Also extends decisions (prompt_version, guidance_ids_used per Plan #5 carry-forward),
-- your_videos (scheduled status + scheduled_for + posted_hour_local + posted_dow_local),
-- channels (max_clip_ingest_per_day + timezone + posting_schedule + target_format_mix),
-- and renames your_videos_analytics_snapshots → video_analytics with extended columns.

-- 1) decisions extension (Plan #5 carry-forward)
alter table public.decisions
  add column prompt_version text,
  add column guidance_ids_used uuid[] not null default '{}';

-- 2) your_videos extension
alter table public.your_videos
  add column scheduled_for timestamptz,
  add column posted_hour_local int check (posted_hour_local between 0 and 23),
  add column posted_dow_local int check (posted_dow_local between 0 and 6);
alter table public.your_videos drop constraint your_videos_status_check;
alter table public.your_videos add constraint your_videos_status_check
  check (status in (
    'draft','rendering','rendered','scheduled','uploading','posted','failed'
  ));
create index your_videos_scheduled_idx on public.your_videos (scheduled_for)
  where status = 'scheduled';
create index your_videos_time_of_day_idx
  on public.your_videos (channel_id, posted_dow_local, posted_hour_local)
  where status = 'posted';

-- 3) channels extension
alter table public.channels
  add column max_clip_ingest_per_day int not null default 10,
  add column timezone text not null default 'America/New_York',
  add column posting_schedule jsonb not null default '{
    "weekdays": ["07:30","08:30","18:30","20:00"],
    "weekends": ["11:30","13:30","19:30","21:00"]
  }'::jsonb,
  add column target_format_mix jsonb not null default '{
    "explainer": 0.60,
    "compilation": 0.40
  }'::jsonb;

-- 4) Rename + extend your_videos_analytics_snapshots → video_analytics
alter table public.your_videos_analytics_snapshots rename to video_analytics;
alter table public.video_analytics rename column video_id to your_video_id;
alter table public.video_analytics
  add column shares bigint,
  add column impressions bigint,
  add column watch_time_seconds bigint,
  add column retention_curve_jsonb jsonb,
  add column raw_payload jsonb;
alter index yv_analytics_video_idx rename to video_analytics_video_idx;

-- 5) clip_library
create table public.clip_library (
  id uuid primary key default uuid_generate_v4(),
  source_url text not null,
  source_platform text not null check (source_platform in ('youtube','tiktok','reddit','twitch','upload')),
  source_creator text,
  local_path text not null,
  duration_seconds numeric not null,
  width int,
  height int,
  description text,
  tags text[] not null default '{}',
  niche_id uuid references public.niches(id) on delete set null,
  added_at timestamptz not null default now(),
  added_by text not null,
  unique (source_url)
);
create index clip_library_tags_idx on public.clip_library using gin (tags);
create index clip_library_niche_idx on public.clip_library (niche_id, added_at desc);

-- 6) music_tracks
create table public.music_tracks (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  artist text,
  source text not null default 'youtube_audio_library'
    check (source in ('youtube_audio_library','operator_upload','public_domain','creator_commons')),
  license_notes text,
  requires_attribution boolean not null default false,
  local_path text not null,
  duration_seconds numeric,
  genre text,
  energy_level int check (energy_level between 1 and 5),
  added_at timestamptz not null default now()
);
create index music_tracks_genre_energy_idx on public.music_tracks (genre, energy_level);
create index music_tracks_attribution_idx on public.music_tracks (requires_attribution);

-- 7) compilation_drafts
create table public.compilation_drafts (
  id uuid primary key default uuid_generate_v4(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  topic_queue_id uuid references public.topic_queue(id) on delete set null,
  theme text not null,
  title_template text not null,
  accent_word text not null,
  title_formula_id text not null,
  reveal_pattern text not null check (reveal_pattern in ('chronological','dramatic','reverse_rank')),
  caption_style text not null check (caption_style in ('descriptive','reactive','mixed')),
  layout_variant text not null default 'top5_sidebar'
    check (layout_variant in ('top5_sidebar','top5_overlay')),
  clip_refs jsonb not null,
  music_track_id uuid references public.music_tracks(id) on delete set null,
  status text not null default 'proposed' check (status in (
    'proposed','approved','rejected','rendering','rendered','posted','failed'
  )),
  rendered_path text,
  promoted_your_video_id uuid references public.your_videos(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index compilation_drafts_channel_status_idx on public.compilation_drafts (channel_id, status, created_at desc);
create index compilation_drafts_recent_patterns_idx on public.compilation_drafts (channel_id, created_at desc)
  where status in ('posted','rendered');

-- 8) render_jobs
create table public.render_jobs (
  id uuid primary key default uuid_generate_v4(),
  job_type text not null check (job_type in ('clip_ingest','render_f1','render_f2','upload')),
  payload jsonb not null,
  status text not null default 'pending' check (status in (
    'pending','claimed','running','succeeded','failed'
  )),
  attempts int not null default 0,
  last_error text,
  claimed_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  sandbox_invocation_id text,
  your_video_id uuid references public.your_videos(id) on delete cascade,
  compilation_draft_id uuid references public.compilation_drafts(id) on delete cascade,
  clip_library_id uuid references public.clip_library(id) on delete set null,
  created_at timestamptz not null default now()
);
create index render_jobs_claimable_idx on public.render_jobs (status, created_at)
  where status in ('pending','claimed','running');
create index render_jobs_type_idx on public.render_jobs (job_type, status);

-- 9) ingest_blocklist
create table public.ingest_blocklist (
  id uuid primary key default uuid_generate_v4(),
  source_platform text not null check (source_platform in ('reddit','youtube','tiktok')),
  identifier text not null,
  identifier_type text not null check (identifier_type in ('subreddit','author')),
  reason text,
  added_by text not null default 'operator',
  added_at timestamptz not null default now(),
  unique (source_platform, identifier_type, identifier)
);

-- 10) ingest_skip_log
create table public.ingest_skip_log (
  id uuid primary key default uuid_generate_v4(),
  source_platform text not null,
  source_url text not null,
  stage_1_score int not null,
  reasoning text,
  skipped_at timestamptz not null default now()
);
create index ingest_skip_log_recent_idx on public.ingest_skip_log (skipped_at desc);

-- 11) youtube_oauth_state
create table public.youtube_oauth_state (
  state text primary key,
  channel_id uuid not null references public.channels(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 12) operator_alerts
create table public.operator_alerts (
  id uuid primary key default uuid_generate_v4(),
  channel_id uuid references public.channels(id) on delete cascade,
  category text not null check (category in (
    'format_mix_drift','schedule_backlog_overflow','cost_spike',
    'oauth_token_revoked','clip_ingest_zero_yield','analyst_recommendation'
  )),
  severity text not null default 'info' check (severity in ('info','warn','error')),
  message text not null,
  suggested_actions jsonb,
  context jsonb,
  status text not null default 'unresolved'
    check (status in ('unresolved','acknowledged','resolved','dismissed')),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index operator_alerts_unresolved_idx on public.operator_alerts (channel_id, severity, created_at desc)
  where status in ('unresolved','acknowledged');

-- 13) schedule_recommendations (Plan #5 writes; Plan #4 ships table + UI)
create table public.schedule_recommendations (
  id uuid primary key default uuid_generate_v4(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  analyst_run_id uuid,
  recommended_posting_schedule jsonb,
  recommended_format_mix jsonb,
  evidence jsonb not null,
  confidence text not null check (confidence in ('low','medium','high')),
  status text not null default 'pending'
    check (status in ('pending','applied','dismissed','superseded')),
  applied_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);
create index schedule_recs_channel_status_idx
  on public.schedule_recommendations (channel_id, status, created_at desc);

-- 14) Seed the composer agent row (orchestrator joins agents on agent_id).
-- Placeholder description + prompt_template — real values land in Phase 4 when the
-- Composer agent code ships (src/lib/agents/composer.ts).
insert into public.agents (id, display_name, description, prompt_template, current_state, current_task)
values (
  'composer',
  'The Composer',
  'Assembles Top-5 compilation drafts from clip_library candidates per Strategist brief. Phase 4 implementation.',
  'PLACEHOLDER — Phase 4 implementation defines the real prompt template.',
  'idle',
  null
)
on conflict (id) do nothing;
