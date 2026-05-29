-- Plan #5 pivot: auto-upload removed; flip the prod row stuck at status='uploading' back to 'rendered'
-- so Darius can post it manually once the Phase 4 mark-posted flow ships.
-- Idempotent: only fires if the row is still in 'uploading' state.

update public.your_videos
set
  status = 'rendered',
  scheduled_for = null,
  updated_at = now()
where id = '11c221e0-693a-4e4c-a096-24725c4e327b'::uuid
  and status = 'uploading';

-- Also mark the corresponding running upload render_job as failed so /admin queries
-- don't show it as still-running. Idempotent on status = 'running'.
update public.render_jobs
set
  status = 'failed',
  finished_at = now(),
  last_error = coalesce(last_error || E'\n', '') ||
    '[plan-5] Auto-upload removed from product. Stuck row reverted to rendered for manual posting.'
where your_video_id = '11c221e0-693a-4e4c-a096-24725c4e327b'::uuid
  and job_type = 'upload'
  and status = 'running';
