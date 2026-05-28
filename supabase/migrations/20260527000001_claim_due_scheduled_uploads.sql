-- Atomic claim for the scheduled-uploader cron.
-- Selects due 'scheduled' rows FOR UPDATE SKIP LOCKED, flips status to 'uploading',
-- returns ids + channel_id for the worker to pick up.
create or replace function public.claim_due_scheduled_uploads(p_now timestamptz, p_limit int)
returns table (id uuid, channel_id uuid)
language plpgsql as $$
begin
  return query
  with due as (
    select y.id from public.your_videos y
    where y.status = 'scheduled' and y.scheduled_for <= p_now
    order by y.scheduled_for
    limit p_limit
    for update skip locked
  )
  update public.your_videos y
     set status = 'uploading', updated_at = now()
    from due d
   where y.id = d.id
   returning y.id, y.channel_id;
end;
$$;

grant execute on function public.claim_due_scheduled_uploads(timestamptz, int) to service_role;
