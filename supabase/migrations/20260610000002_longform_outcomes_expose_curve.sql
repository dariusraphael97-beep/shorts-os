-- Expose the raw retention curve on the feedback-flywheel view so the L2 loader can derive opening
-- retention ON THE FLY when the pre-computed first_30s/60s columns are null.
--
-- Why: the manual YT-Studio paste path (the only way to get a curve for a low-view video like B58,
-- since the Analytics API withholds it under a views threshold) writes retention_curve_jsonb but does
-- NOT compute the derived opening-retention scalars. Reading the raw curve here lets the distiller
-- learn from a pasted curve immediately, independent of which writer populated it.
--
-- CREATE OR REPLACE only appends columns at the end — existing columns/order are preserved.
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
  v.duration_seconds,
  va.retention_curve_jsonb
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
