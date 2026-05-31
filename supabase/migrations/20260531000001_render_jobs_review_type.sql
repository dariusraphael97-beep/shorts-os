-- Allow a 'review' render job (pre-publish QA pass on a rendered MP4).
alter table public.render_jobs
  drop constraint if exists render_jobs_job_type_check;

alter table public.render_jobs
  add constraint render_jobs_job_type_check
  check (job_type in ('clip_ingest','render_f1','render_f2','upload','review'));
