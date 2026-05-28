-- Niche-finder source observations (every video we ingest from any source)
create table if not exists public.shorts_observations (
  video_id text primary key,
  source text not null check (source in (
    'youtube_most_popular',
    'youtube_search',
    'youtube_watch_list',
    'reddit_topic',
    'tiktok_creative_center',
    'google_trends'
  )),
  channel_id text,
  channel_subscriber_count bigint,
  title text not null,
  description text,
  tags jsonb default '[]'::jsonb,
  thumbnail_url text,
  duration_seconds integer,
  published_at timestamptz,
  view_count bigint default 0,
  like_count bigint default 0,
  comment_count bigint default 0,
  observed_at timestamptz not null default now(),
  last_refreshed_at timestamptz not null default now()
);

create index if not exists shorts_observations_source_observed_at_idx
  on public.shorts_observations (source, observed_at desc);

create index if not exists shorts_observations_channel_id_published_at_idx
  on public.shorts_observations (channel_id, published_at desc);

-- LLM classifier output
create table if not exists public.shorts_classifications (
  video_id text primary key references public.shorts_observations (video_id) on delete cascade,
  topic_label text not null,
  format_label text not null check (format_label in (
    'narrated_storytelling','talking_head_facts','talking_head_advice',
    'compilation_montage','transformation_reveal','ranking_list','before_after',
    'tutorial_quick','pov_skit','screen_record_walkthrough','ai_voiceover_facts',
    'reaction','interview_clip','news_recap','product_review','meme_format',
    'live_capture','other'
  )),
  audience_signal text check (audience_signal in (
    'seniors','gen_z','millennials','kids','professionals','hobbyists','general'
  )),
  confidence numeric(4,3) not null,
  model text not null,
  prompt_version text not null,
  vision_used boolean not null default false,
  transcript_used boolean not null default false,
  classified_at timestamptz not null default now()
);

create index if not exists shorts_classifications_topic_format_idx
  on public.shorts_classifications (topic_label, format_label);

create index if not exists shorts_classifications_prompt_version_idx
  on public.shorts_classifications (prompt_version);

-- Sample retention for QC review (5% of classifications)
create table if not exists public.classification_samples (
  id uuid primary key default gen_random_uuid(),
  video_id text not null references public.shorts_observations (video_id) on delete cascade,
  prompt_full text not null,
  response_full text not null,
  chosen_labels jsonb not null,
  reviewed boolean not null default false,
  review_verdict text check (review_verdict in ('correct','wrong','partial')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists classification_samples_reviewed_idx
  on public.classification_samples (reviewed, created_at desc);
