-- Atomic claim: returns up to p_limit pending rows, marks them claimed.
create or replace function public.claim_render_jobs(p_limit int)
returns setof public.render_jobs
language sql
as $$
  with claimable as (
    select id from public.render_jobs
    where status = 'pending'
    order by created_at
    limit p_limit
    for update skip locked
  )
  update public.render_jobs r
    set status='claimed', claimed_at=now()
    from claimable c
    where r.id = c.id
    returning r.*;
$$;

-- Watchdog reset: claimed >5min → pending+1attempt; running >30min → pending+1attempt.
-- After attempts=3, leaves status='failed' with last_error='watchdog_max_attempts'.
create or replace function public.reset_stuck_render_jobs()
returns setof public.render_jobs
language plpgsql
as $$
declare
  reset_row public.render_jobs;
begin
  -- claimed > 5 min and attempts < 3
  for reset_row in
    update public.render_jobs
      set status = case when attempts + 1 >= 3 then 'failed' else 'pending' end,
          attempts = attempts + 1,
          last_error = case when attempts + 1 >= 3 then 'watchdog_max_attempts' else null end,
          claimed_at = null,
          started_at = null,
          finished_at = case when attempts + 1 >= 3 then now() else null end
      where (status='claimed' and claimed_at < now() - interval '5 minutes')
         or (status='running' and started_at < now() - interval '30 minutes')
      returning *
  loop
    return next reset_row;
  end loop;
end;
$$;
