-- Weekly niche cluster snapshots (computed by the Sunday-night clustering cron in Sub-phase D)
create table if not exists public.niche_clusters (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  canonical_topic text not null,
  format_label text not null,
  example_video_ids jsonb not null default '[]'::jsonb,
  channel_count integer not null default 0,
  avg_views bigint,
  avg_velocity_24h numeric(8,3),
  outlier_density numeric(4,3),
  first_seen_at timestamptz,
  first_mover_score numeric(5,4),
  proven_score numeric(5,4),
  niche_score numeric(5,4),
  discovery_state text check (discovery_state in ('pre_public','public')),
  production_fit text check (production_fit in ('native','needs_manual_recording','needs_manual_editing','manual_only')),
  audience_signal text,
  digest_rank integer,
  explainability_top_signals jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists niche_clusters_week_rank_idx
  on public.niche_clusters (week_start, digest_rank);

create index if not exists niche_clusters_topic_format_idx
  on public.niche_clusters (canonical_topic, format_label);

-- Per-action interaction log (for niche-score weight tuning)
create table if not exists public.niche_actions (
  id uuid primary key default gen_random_uuid(),
  niche_cluster_id uuid not null references public.niche_clusters (id) on delete cascade,
  action text not null check (action in ('viewed','investigated','generated_from','dismissed','hidden')),
  actor text,
  created_at timestamptz not null default now()
);

create index if not exists niche_actions_cluster_idx
  on public.niche_actions (niche_cluster_id, created_at desc);

-- Sealed predictions (written at digest-time; closed when video posted)
create table if not exists public.niche_predictions (
  id uuid primary key default gen_random_uuid(),
  niche_cluster_id uuid not null references public.niche_clusters (id) on delete cascade,
  predicted_at timestamptz not null default now(),
  predicted_views_7d_lower bigint not null,
  predicted_views_7d_upper bigint not null,
  actual_video_id uuid references public.your_videos (id) on delete set null,
  actual_views_7d bigint,
  accuracy_verdict text check (accuracy_verdict in ('within','below','above')),
  closed_at timestamptz
);

create index if not exists niche_predictions_cluster_idx
  on public.niche_predictions (niche_cluster_id, predicted_at desc);

-- Moat-validation tracking (manual log + computed lag)
create table if not exists public.vidiq_appearances (
  id uuid primary key default gen_random_uuid(),
  canonical_topic text not null,
  format_label text not null,
  first_surfaced_by_shorts_os_at timestamptz not null,
  first_surfaced_by_vidiq_at timestamptz,
  first_surfaced_by_1of10_at timestamptz,
  first_surfaced_by_exploding_topics_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
