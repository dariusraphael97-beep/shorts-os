-- Longform Video Generator (Phase L1) schema.
-- Reuses your_videos + decisions; adds longform columns, the ledger join key,
-- new job-type enum values, the two new agents, and the outcome-join view.

-- 1. your_videos: longform draft fields + the structured plan (validated in app code).
alter table public.your_videos
  add column if not exists format text not null default 'short'
    check (format in ('short', 'longform')),
  add column if not exists target_duration_seconds int,
  add column if not exists orientation text not null default '9:16'
    check (orientation in ('9:16', '16:9')),
  add column if not exists style_preset_id text,
  add column if not exists longform_plan jsonb,
  add column if not exists chapter_markers jsonb;

-- 2. decisions: key a ledger row directly to the draft so analytics can join later.
alter table public.decisions
  add column if not exists your_video_id uuid references public.your_videos(id) on delete set null;
create index if not exists decisions_your_video_idx on public.decisions (your_video_id);

-- 3. jobs.kind: allow the longform agent-plan job.
alter table public.jobs drop constraint if exists jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check
  check (kind in ('scrape', 'score_topics', 'produce_video', 'analyze_performance', 'produce_longform_video'));

-- 4. render_jobs.job_type: allow the longform render job.
-- NOTE: 'review' is kept here on purpose. It was added to prod out-of-band by the
-- 20260601001909_render_jobs_review_type migration (which has no file in this repo), so this
-- redefinition must stay a SUPERSET — dropping it would silently regress a value prod allows today.
alter table public.render_jobs drop constraint if exists render_jobs_job_type_check;
alter table public.render_jobs add constraint render_jobs_job_type_check
  check (job_type in ('clip_ingest', 'render_f1', 'render_f2', 'upload', 'review', 'render_longform'));

-- 5. Seed the two new agents (FK target for decisions/agent_messages). writer + voice_coach already exist.
insert into public.agents (id, display_name, emoji, description, prompt_template, model_id) values
('style_picker', 'The Style Picker', '🎨',
 'Chooses ONE visual style preset per longform video (cinematic-realistic or editorial-graphic) plus a music mood, and emits a style bible for cross-image consistency.',
 'Real prompt lives in code at src/lib/agents/longform/style-picker.ts:buildPrompt() (rebuilt per dispatch).',
 'claude-haiku-4-5'),
('beat_planner', 'The Beat Planner', '🎞️',
 'Splits chapter narration into ~3-5s image beats and writes a strong, style-consistent Higgsfield image prompt for each.',
 'Real prompt lives in code at src/lib/agents/longform/beat-planner.ts:buildPrompt() (rebuilt per dispatch).',
 'claude-sonnet-4-5')
on conflict (id) do nothing;

insert into public.agent_prompt_versions (agent_id, version, prompt_template, changelog)
select id, prompt_version, prompt_template, 'Initial L1 longform agent prompt (real prompt in code).'
from public.agents where id in ('style_picker', 'beat_planner')
on conflict do nothing;

-- 6. Outcome-join view: longform ledger rows joined to their video's latest analytics snapshot.
-- security_invoker so the view runs as the querying role (not the definer) — Supabase best practice
-- and clears the security_definer_view linter ERROR.
create or replace view public.longform_decision_outcomes
with (security_invoker = true) as
select
  d.id              as decision_id,
  d.agent_id,
  d.decision_type,
  d.chosen,
  d.your_video_id,
  v.title,
  v.status,
  v.posted_at,
  va.views,
  va.avg_view_duration_seconds,
  va.ctr_pct,
  va.watch_time_seconds,
  va.snapshot_at    as analytics_snapshot_at
from public.decisions d
join public.your_videos v on v.id = d.your_video_id
left join lateral (
  select * from public.video_analytics a
  where a.your_video_id = v.id
  order by a.snapshot_at desc
  limit 1
) va on true
where d.your_video_id is not null
  and v.format = 'longform';
