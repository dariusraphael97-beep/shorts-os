# Plan #4 Phase 5 Sub-phase B — fresh-chat kickoff

Copy-paste the block below into a new Claude Code chat in `/Users/darius/Downloads/shorts-os` to start Sub-phase B.

---

Plan #4 Phase 5 Sub-phase B — upload handler + analytics sync. Sub-phase A shipped (PR #7 merged, prod at `shorts-os-roan.vercel.app/settings/channel` showing "YouTube OAuth: connected"). Now ship the upload pipeline + daily YouTube Analytics sync so closing acceptance item #2 ("one real video posted from drafts via /lab → /operations → YouTube") becomes testable.

Plan doc: `docs/superpowers/plans/2026-05-27-shorts-os-plan-4-phase-5.md`, sub-phase "# Sub-phase B".

## State at chat start

- `main` HEAD = `81b95ae` (prelim walk outcome). Vercel prod is Ready and serving Sub-phase A's OAuth routes.
- `channels` row for the active channel (id `c8edc30f-375d-4b38-b6b0-77fa4b5e59a7`, slug `dyfrx_9754`):
  - `external_channel_id` = `UCUXkixLGmtaKukPT3plv9YQ` (real)
  - `oauth_refresh_token_encrypted` populated (226 chars of AES-256-GCM ciphertext containing the real Google refresh token)
- Phase 5 env vars in Vercel (Production + Preview + Development): `OAUTH_TOKEN_ENCRYPTION_KEY_V1` (Sensitive, same value across all 3), `OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION=1`, `ANALYTICS_SYNC_WINDOW_DAYS=14`, `SCHEDULED_UPLOADER_BATCH_SIZE=5`, `OPERATIONS_BACKLOG_HORIZON_DAYS=7`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (Sensitive on prod+preview).
- Vitest baseline: 258 passing, 11 known pre-existing env-dependent failures (env.test, ai/*, supabase/schema-*, supabase/server.test — all require Sensitive secrets not in dev `.env.local`). Plus 1 pre-existing tsc error in `src/tests/lib/auth/session.test.ts(32,19)` — Phase 4 baseline bug, ignore.
- `scripts/render-worker/lib/encryption.ts` is a byte-equal mirror of `src/lib/encryption.ts` (guarded by vitest).
- `scripts/render-worker/handlers/upload.ts` is still the Phase 1 stub (`throw new Error('upload handler not implemented until Phase 5')`). Sub-phase B replaces it.

## Sub-phase B tasks (from plan)

- **B1** — `scripts/render-worker/lib/youtube-upload.ts` (resumable `videos.insert` helper, no `googleapis` dep) + `scripts/render-worker/lib/google-oauth.ts` (worker mirror of `src/lib/clients/google-oauth.ts`) + byte-equality guard test.
- **B2** — `scripts/render-worker/handlers/upload.ts` real impl: load your_video + channel.oauth_refresh_token_encrypted → decrypt → refresh access token → download MP4 from Blob → resumable upload → return `{your_video_id, external_video_id, url}`. Adapt `scripts/render-worker/run.ts` signature.
- **B3** — Callback handler `/api/render/complete`: add upload side-effect that calls `markPosted(supabase, {videoId, externalVideoId, url, postedAt, channelTimezone})` — writes `posted_at`, `external_video_id`, `url`, `posted_hour_local`, `posted_dow_local`, `status='posted'`. Add `oauth_token_revoked` operator_alert on token failures. `markPosted` is a new helper on `src/lib/supabase/repositories/your-videos.ts`. Also adds `luxon` as a root dep.
- **B4** — `src/lib/supabase/repositories/video-analytics.ts` (upsert helper, `onConflict: 'your_video_id,snapshot_at'`) + `src/lib/clients/youtube-analytics.ts` (fetchVideoStats + fetchCoreReport + fetchRetentionReport) + rewrite `src/app/api/cron/performance-sync/route.ts` (replace stub with the real daily sweep).
- **B5** — Merge sub-phase B + prod smoke. Smoke is operator-initiated by SQL-injecting an upload job against an existing rendered `your_videos` row.

Branch naming: `plan-4-phase-5-upload-analytics`. Open PR against main.

## How to execute (continuous, no per-task hand-offs)

1. Use `superpowers:subagent-driven-development` — one implementer subagent per task, one combined spec+quality reviewer per task (haiku model for the reviewer is fine since these are tightly-spec'd tasks). Sonnet for implementer.
2. Brief each subagent with: the exact plan-task text, the filtered-test command, the known-failing-test list, and the strict instruction NOT to modify out-of-scope files.
3. After all 4 code tasks land on the branch, push + open PR with the body from the plan's B5.
4. Prod smoke: agent does this directly via Supabase MCP + SQL. Don't ask Darius for clicks. The smoke insert is `insert into render_jobs(job_type, payload, your_video_id, status) values('upload', jsonb_build_object('your_video_id', '<uuid>'), '<uuid>', 'pending');`. Pick a Phase 4 your_videos row with `status='rendered'` and `render_artifact_url IS NOT NULL` for the smoke target. Watch render_jobs.status flip via polling SQL, watch your_videos.status flip to 'posted'.
5. Verify the posted video appears on YouTube Studio (operator confirms; agent can use Supabase MCP + `youtube.videos.list` via API to confirm independently).
6. +1 day after merge: trigger `/api/cron/performance-sync` via authed Bash (`vercel cron list` then manually trigger, or just wait for the scheduled run) — verify `video_analytics` has a row.

## Hard rules (carry forward — re-read each)

- **Plain English in chat.** Technical docs technical.
- **Stop at the end of every sub-phase** and hand back a fresh-chat prompt. Sub-phase B boundary = B5 merged + smoke passed. Then hand off Sub-phase C.
- **Do operator-gated work yourself.** Reference `~/.claude/projects/-Users-darius-Downloads-shorts-os/memory/feedback_do_it_yourself.md` — Darius has `gh`, `vercel`, `supabase` CLIs auth'd + Supabase + Vercel MCPs installed. Push, PR, merge, SQL, env-var changes, redeploys are all agent-doable.
- **No `@vercel/sandbox` imports** outside `src/lib/render/workers/vercel-sandbox.ts` + `scripts/render-worker/`.
- **TS strict, no `any`** (mocks may use `as never` at chain boundaries). **Zod at HTTP boundaries**. **`server-only` on secret-holding modules**.
- **COCKPIT_PASSWORD in prod is Sensitive** — only Darius types it. After cookie session is set, agent can drive via Supabase MCP (rather than browser) for everything DB-side.
- **For local dev, `unset ANTHROPIC_BASE_URL`** or AI SDK calls 404.
- **Sensitive env vars can't be `vercel env pull`'d** — generate fresh ones (like A's OAUTH_TOKEN_ENCRYPTION_KEY_V1) or ask Darius once and add via `vercel env add NAME ENV --value=... --sensitive -y`. For preview env, the positional `[git-branch]` arg must be `""` (empty string) to mean "all preview branches" — Vercel won't accept `*`.
- **Vercel crons only run on production deployments.** Don't try to test cron-driven flows on preview.
- **Don't reset main with --hard** without verifying that whatever you're throwing away is already in the squash-merge on origin/main. `gh pr merge --squash --delete-branch` will fail to fast-forward local main; resolve with `git reset --hard origin/main` only after `git log` confirms origin's squash absorbed everything.

## Useful IDs

- Supabase project: `jfmjppzjicvbpnlkmxbg`
- Vercel project: `prj_FooiiEYKOWNMZh3YtjoqwkbsWE0M` (team `team_La4nTrN2OOSH8ETfMRUMDhOq`)
- Active channel: `c8edc30f-375d-4b38-b6b0-77fa4b5e59a7` (slug `dyfrx_9754`, Cars niche `c151f4fa-0e49-4379-a21b-d452d4bdab22`)
- Sub-phase A PR: https://github.com/dariusraphael97-beep/shorts-os/pull/7
- Phase 5 plan: `docs/superpowers/plans/2026-05-27-shorts-os-plan-4-phase-5.md` (~6,957 lines, 37 tasks across 8 sub-phases)

First step in the new chat: read the Sub-phase B section of the plan doc, then dispatch the B1 implementer subagent.
