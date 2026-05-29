-- Pre-publication QA output per draft
create table if not exists public.video_reviews (
  id uuid primary key default gen_random_uuid(),
  your_video_id uuid not null references public.your_videos (id) on delete cascade,
  reviewed_at timestamptz not null default now(),

  title_score numeric(4,3),
  title_verdict text check (title_verdict in ('pass','needs_work','fail')),
  thumbnail_score numeric(4,3),
  thumbnail_verdict text check (thumbnail_verdict in ('pass','needs_work','fail')),
  hook_score numeric(4,3),
  hook_verdict text check (hook_verdict in ('pass','needs_work','fail')),
  pacing_score numeric(4,3),
  pacing_verdict text check (pacing_verdict in ('pass','needs_work','fail')),
  description_seo_score numeric(4,3),
  description_seo_verdict text check (description_seo_verdict in ('pass','needs_work','fail')),
  audio_score numeric(4,3),
  audio_verdict text check (audio_verdict in ('pass','needs_work','fail')),
  visual_score numeric(4,3),
  visual_verdict text check (visual_verdict in ('pass','needs_work','fail')),

  overall_verdict text not null check (overall_verdict in ('ship','revise','block')),
  suggestions jsonb not null default '[]'::jsonb,
  strengths jsonb not null default '[]'::jsonb,
  model text not null,
  prompt_version text not null
);

create index if not exists video_reviews_video_idx
  on public.video_reviews (your_video_id, reviewed_at desc);

-- Operator feedback on each suggestion (learning signal)
create table if not exists public.video_review_feedback (
  id uuid primary key default gen_random_uuid(),
  video_review_id uuid not null references public.video_reviews (id) on delete cascade,
  suggestion_index integer not null,
  action_taken text not null check (action_taken in ('accepted','ignored','partial')),
  recorded_at timestamptz not null default now()
);

create index if not exists video_review_feedback_review_idx
  on public.video_review_feedback (video_review_id, recorded_at desc);
