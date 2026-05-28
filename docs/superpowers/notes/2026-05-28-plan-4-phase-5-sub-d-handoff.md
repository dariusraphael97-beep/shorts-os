# Plan #4 Phase 5 Sub-phase D — handoff (2026-05-28)

PR #12 https://github.com/dariusraphael97-beep/shorts-os/pull/12 — open, Vercel preview SUCCESS, ready to merge.

## What Sub-phase D ships

**API routes** (all `server-only`, Zod-validated, race-safe via `.in('status', [...])`):
- `POST /api/lab/schedule` — body `{videoId, scheduledFor?}`. If `scheduledFor` missing, computes next open slot via `nextOpenSlotAfter`. 400/404/409/503/200.
- `POST /api/lab/upload` — real implementation (was a stub). Flips `rendered|scheduled → uploading`, enqueues `upload` render_job.
- `POST /api/lab/cancel-schedule` — body `{videoId}`. Reverts `scheduled → rendered`.

**UI**:
- `/lab/drafts` now has a **Scheduled** tab (Draft | Rendered | Scheduled | Posted). Rendered rows show `Approve & Schedule` (primary) + `Post now` + `Reject`. Scheduled rows show countdown + `Post now` + `Cancel`. Posted rows render the latest `video_analytics` snapshot (views / avg duration / CTR).
- `/clips` Rendered cards: `Approve & Schedule` (default — POST `/api/clips/rendered/[id]/approve`) + `Post now` (POST `?action=post_now`) + `Reject`.

**Schema-shape fixes**:
- `YourVideo` type now models `scheduled_for`, `posted_hour_local`, `posted_dow_local`.
- `Channel` type now models `timezone`, `posting_schedule` — drops a `as unknown as ChannelForSchedule` cast.
- `/clips` approve now uses `getChannelById(supabase, draft.channel_id)` instead of `getDefaultChannel` — safe once multi-channel ships.

**Test coverage**:
- 17 new tests across the 4 D-route files. All green.
- Full vitest baseline: 301 passing (was 290 + 11 new). 11 pre-existing env-dependent failures unchanged.
- `tsc --noEmit` clean except for the pre-existing `session.test.ts(32,19)` error from Phase 4.

## What Sub-phase D does NOT ship (yet)

- The `scheduled-uploader` cron — Sub-phase E. Until E lands, scheduled rows sit at `status='scheduled'` until manually flipped via `Post now`.
- `schedule_recommendations` UI surface — Sub-phase F.
- The `schedule_backlog_overflow` alert path — Sub-phase E writes the row; F or later renders it.

## Prod smoke required after merging

This was deferred from Sub-phase B because Sandbox hung silently. D's `Post now` path does NOT touch Sandbox (the rendered MP4 already lives in Supabase Storage; the upload worker just pulls + uploads to YouTube). So this smoke should actually run end-to-end.

**Smoke steps** (operator-gated — publishes a real video to YouTube on the active channel):

1. Merge PR #12 to main. Wait for Vercel prod Ready.
2. Open `/lab/drafts` in a browser. Confirm the tab bar shows: Draft | Rendered | Scheduled | Posted.
3. Click the **Rendered** tab. Pick any video (or render a fresh one if none exist).
4. Click **Approve & Schedule**. Expect: row disappears from Rendered, reappears in Scheduled with `posts in Nh Mm` countdown.
5. Click the **Scheduled** tab. Click **Cancel** on that row. Expect: row returns to Rendered.
6. Click **Approve & Schedule** again to put it back in Scheduled.
7. From the Scheduled tab, click **Post now**. Expect: row disappears from Scheduled (status → `uploading`), upload worker picks it up via the existing render_jobs cron, video lands on YouTube, row appears in Posted.
8. Click the **Posted** tab. Expect: the new row with `0 views · —s avg · —% CTR` (analytics not yet synced) + a YouTube link.

If step 7 hangs at `uploading` for > 5 min: check `/admin/render-jobs` or run `supabase select * from render_jobs where job_type='upload' order by created_at desc limit 5` to inspect.

## Active channel for smoke

- Channel: `c8edc30f-375d-4b38-b6b0-77fa4b5e59a7` (slug `dyfrx_9754`, external `UCUXkixLGmtaKukPT3plv9YQ`, timezone America/New_York, posting_schedule weekdays `07:30` weekends `11:30`).

## Next: Sub-phase E

`scheduled-uploader` cron. Every 15 minutes:
1. Atomic-claim due rows via the `claim_due_scheduled_uploads` PG function (shipped in Sub-phase C).
2. Apply per-channel `max_uploads_per_day` deferral.
3. Enqueue `upload` render_jobs for the claimed rows.
4. Write `schedule_backlog_overflow` alert row when the 14-day horizon has no open slot.

Pure logic lives in `src/lib/render/scheduled-uploader.ts`; the cron route is a thin wrapper. Spec is in `docs/superpowers/plans/2026-05-27-shorts-os-plan-4-phase-5.md` § Sub-phase E.

## Fresh-chat kickoff prompt for Sub-phase E

(see the chat hand-back below — paste this into a new chat after the smoke confirms D is good)
