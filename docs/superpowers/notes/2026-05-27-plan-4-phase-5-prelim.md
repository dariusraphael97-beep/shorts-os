# Plan #4 Phase 5 — Phase 0 prelim walk

The operator runs these steps on prod (https://shorts-os-roan.vercel.app) and pastes findings back into chat. The agent then appends an "Outcome" section here.

## Steps

1. Visit https://shorts-os-roan.vercel.app/lab and log in (COCKPIT_PASSWORD).
2. From "Ready to dispatch," pick any reviewed topic and click Dispatch.
3. Observe the active-run pane through Strategist → Writer (or Composer) → Voice Coach → Director.
   - If the Strategist picks `format='compilation'`, the run forks to Composer and writes a `compilation_drafts` row. Verify by visiting `/clips?tab=candidates`.
   - If the Strategist picks `format='explainer'`, a `your_videos` draft lands in `/lab/drafts`.
4. **Compilation path only:**
   a. Visit `/clips?tab=candidates`. The fresh candidate should appear.
   b. Click Approve. Wait ~60s for the render-dispatcher cron + ~30s for render_f2 to finish (the watchdog cron runs every 5 min — if the row stays in `rendering` past 5 min, capture the row's `compilation_drafts.id` and `render_jobs.last_error` value before reporting).
   c. Switch to `/clips?tab=rendered`. The freshly-rendered draft should appear with an inline `<video>` preview.
   d. Click Approve. The row should promote into `your_videos` (visible at `/lab/drafts?tab=rendered`).
5. **Explainer path only:** click Render on the draft in `/lab/drafts`. Wait for completion; verify the rendered preview at `/lab/drafts?tab=rendered`.

## What to capture in chat

For each step, report:
- Pass / Fail / Partial.
- Any UI rough edge (slow load, missing toast, broken link, weird empty state).
- Any console / network error visible in DevTools.

If render_dispatcher does not pick up the job within 90s, run this query at https://supabase.com/dashboard/project/jfmjppzjicvbpnlkmxbg/sql/new and paste the JSON:

```sql
select id, job_type, status, attempts, last_error, claimed_at, sandbox_invocation_id
from render_jobs
order by created_at desc
limit 5;
```

## Outcome

**Status: deferred-with-reason (2026-05-27)**

The walk was not run. Decision context:

- Phase 4 already smoked the render_f2 worker pipeline in prod end-to-end (31s wall-clock, real 30s 1080×1920 mp4 in Vercel Blob, promotion into your_videos confirmed — see `2026-05-27-plan-4-phase-4-benchmark.md`).
- `topic_queue` has 2 reviewed topics, both AI-themed leftovers from before the Phase 1 Cars reseed. Dispatching either on the Cars channel would test the Strategist+Composer's misalignment behavior, not the happy path.
- The /clips Candidates → Rendered → Approve UI has unit-test coverage (91 vitest tests as of Phase 4 close).
- The /lab dispatch UI hasn't changed since Plan #3 and is exercised regularly.

The walk was a "verify the parts of Phase 4 the worker smoke didn't cover" gate. With no Cars-themed reviewed topics in the queue, the marginal value of running it on a misaligned AI topic is low vs. the cost of an operator click-through. The acceptance check moves to Sub-phase B's prod smoke: if dispatching a real video, scheduling it, and posting via the upload pipeline all work end-to-end, the Strategist+Composer+UI chain was working too.

If a Cars-themed topic gets reviewed in `topic_queue` before Plan #5 starts, re-run this walk against it for retroactive coverage.
