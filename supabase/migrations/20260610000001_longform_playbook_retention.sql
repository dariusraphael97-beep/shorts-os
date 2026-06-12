-- Phase L2 learning engine: make first-30s/60s audience retention a first-class, queryable signal.
--
-- The performance-sync cron already stores the full retention CURVE (retention_curve_jsonb). These
-- derived columns reduce that curve to the opening-hold numbers the playbook ranks on, so the
-- distiller can ORDER BY retention instead of re-parsing JSON, and the outcome view can surface them.
--
-- B58 post-mortem: in 2026 the algorithm demotes high-CTR / slow-open videos ("Quality CTR"). These
-- columns are what let the learning store rank retention ABOVE CTR.

-- 1) Derived opening-retention columns on the analytics snapshot.
alter table public.video_analytics
  add column if not exists first_30s_retention numeric,        -- audienceWatchRatio at the 30s mark
  add column if not exists first_60s_retention numeric,        -- audienceWatchRatio at the 60s mark
  add column if not exists relative_retention_opening numeric; -- mean relativeRetentionPerformance over the open

-- 2) Surface them (plus the video length) on the feedback-flywheel view the distiller reads.
--    CREATE OR REPLACE only appends columns at the end — existing columns/order are preserved.
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
  va.snapshot_at    as analytics_snapshot_at,
  va.first_30s_retention,
  va.first_60s_retention,
  va.relative_retention_opening,
  v.duration_seconds
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
