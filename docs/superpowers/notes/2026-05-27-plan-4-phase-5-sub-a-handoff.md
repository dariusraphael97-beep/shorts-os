# Plan #4 Phase 5 Sub-phase A — fresh-chat kickoff

Copy-paste this into a new Claude Code chat in `/Users/darius/Downloads/shorts-os` to continue Phase 5 from the Sub-phase A merge gate.

---

Plan #4 Phase 5 Sub-phase A is **code-complete on branch `plan-4-phase-5-oauth`** (6 commits, head `751730e`). Now driving the operator-gated work that turns it into a merged PR: Task 0 walk, Task A0 env setup, Task A5 local browser smoke, Task A7 push + PR + prod smoke + merge.

Plan doc: `docs/superpowers/plans/2026-05-27-shorts-os-plan-4-phase-5.md`.

## State at chat start

- Branch `plan-4-phase-5-oauth` (HEAD `751730e`), 6 commits ahead of main:
  - `893fc63` — A1: channels encrypt/decrypt helpers + 3 tests
  - `96d2ebd` — A2: youtube_oauth_state repo + 4 tests
  - `eeb2c75` — A3: /api/youtube/oauth/start route + 2 tests
  - `8a7756e` — A4: /api/youtube/oauth/callback + google-oauth client + 8 tests
  - `99a5c07` — A5: /settings/channel page + Connect YouTube button (no new tests — UI only)
  - `751730e` — A6: scripts/render-worker/lib/encryption.ts mirror + byte-equality vitest
- Filtered vitest: 257 passing (baseline was 239 pre-Phase-5; A1-A6 added 18 new tests).
- Unfiltered vitest: 11 known pre-existing env-dependent failures (all require Sensitive Supabase/Anthropic/Cockpit env vars not in this dev `.env.local`). NOT regressions.
- tsc: 1 pre-existing error in `src/tests/lib/auth/session.test.ts(32,19)` — discriminated-union access bug from Phase 4. Independent of Phase 5; safe to ignore for this PR.
- `docs/superpowers/notes/2026-05-27-plan-4-phase-5-prelim.md` exists with the walk checklist but is uncommitted. The Outcome section is empty pending the walk.

## What needs to happen in this chat

The plan's Tasks 0, A0, A5 (step 4), and A7 are operator-driven. The agent walks the operator through them and writes the result docs.

### Step 1 — Task 0 prod UI walk

The operator runs the 5-step walk from `docs/superpowers/notes/2026-05-27-plan-4-phase-5-prelim.md` on `https://shorts-os-roan.vercel.app`. Agent writes the Outcome section based on the operator's findings, then commits the doc with: `docs(plan-4): Phase 5 prelim — Phase 4 prod UI walk outcome`. If any walk step FAILs and isn't a known placeholder gap, pause the PR and open a focused fix branch first.

### Step 2 — Task A0 operator env setup

Hand the operator the A0 checklist from the plan:
1. `openssl rand -hex 32` for `OAUTH_TOKEN_ENCRYPTION_KEY_V1`.
2. Google Cloud project: enable YouTube Data API v3 + YouTube Analytics API. OAuth client (Web app) with redirect URIs `https://shorts-os-roan.vercel.app/api/youtube/oauth/callback` and `http://localhost:3000/api/youtube/oauth/callback`.
3. Add to Vercel (Prod + Preview + Dev):
   - `GOOGLE_OAUTH_CLIENT_ID` (Plaintext)
   - `GOOGLE_OAUTH_CLIENT_SECRET` (Sensitive)
   - `OAUTH_TOKEN_ENCRYPTION_KEY_V1` (Sensitive)
   - `OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION=1`
   - `ANALYTICS_SYNC_WINDOW_DAYS=14`
   - `SCHEDULED_UPLOADER_BATCH_SIZE=5`
   - `OPERATIONS_BACKLOG_HORIZON_DAYS=7`
4. SQL update for the active channel:
   ```sql
   update channels set external_channel_id = '<real UCxxxx from YouTube Studio>'
   where slug = 'dyfrx_9754';
   ```
5. Empty-commit redeploy bump so warm functions pick up new env.
6. Operator confirms all rows yes in the prelim notes doc (Operator setup A0 section).

### Step 3 — Task A5 local browser smoke

Once A0 envs are in `.env.local` and Google Cloud client is created, operator runs:
```
unset ANTHROPIC_BASE_URL && npm run dev
```
Then visits `http://localhost:3000/settings/channel`, clicks Connect YouTube, consents (test user warning is fine), and verifies redirect back with `?connected=true` toast + DB check that `channels.oauth_refresh_token_encrypted` is now non-null.

### Step 4 — Task A7 push, PR, prod smoke, merge

When A0 is confirmed in Vercel:
```
git push -u origin plan-4-phase-5-oauth
gh pr create --title "Plan #4 Phase 5 Sub-phase A — YouTube OAuth foundation" --body "<from plan>"
```
After Vercel preview deploys, operator drives the prod OAuth flow through the preview URL (preview is SSO-protected — operator's browser session bypasses it). Once `oauth_refresh_token_encrypted IS NOT NULL` in Supabase, merge:
```
gh pr merge plan-4-phase-5-oauth --squash --delete-branch
```

## Then hand off Sub-phase B (a NEW chat)

Sub-phase B is the next biggest chunk (upload handler + analytics sync — 5 tasks, ~250 lines net). It depends on A's OAuth working in prod, so the merge above is the gate. After merge, write `docs/superpowers/notes/2026-05-27-plan-4-phase-5-sub-b-handoff.md` and hand it back as the Sub-phase B kickoff.

## Carry-forward hard rules

- Plain English in chat. Technical docs technical.
- Stop at the end of every phase (sub-phase boundary) and hand back a fresh-chat prompt.
- No `@vercel/sandbox` imports outside `src/lib/render/workers/vercel-sandbox.ts` + `scripts/render-worker/`.
- TS strict, no `any`, Zod at boundaries, `server-only` on secret-holding modules.
- COCKPIT_PASSWORD in prod is Sensitive — operator drives any /login + UI-paste steps.
- For local dev, unset `ANTHROPIC_BASE_URL`.
- Sensitive env vars can't be `vercel env pull`'d — operator-driven curl tests or early-merge pattern.
- Vercel crons only run on production deployments; preview-deploy SSO requires `vercel curl` or operator browser.

## Useful IDs

- Supabase project: `jfmjppzjicvbpnlkmxbg`
- Vercel project: `prj_FooiiEYKOWNMZh3YtjoqwkbsWE0M` (team `team_La4nTrN2OOSH8ETfMRUMDhOq`)
- Active channel: `c8edc30f-375d-4b38-b6b0-77fa4b5e59a7` (slug `dyfrx_9754`, Cars niche `c151f4fa-0e49-4379-a21b-d452d4bdab22`)
