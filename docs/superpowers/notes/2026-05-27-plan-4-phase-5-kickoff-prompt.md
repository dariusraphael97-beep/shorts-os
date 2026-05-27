# Plan #4 Phase 5 — fresh-chat kickoff

Copy-paste the block below into a new Claude Code chat in `/Users/darius/Downloads/shorts-os` to start Phase 5. Fill in the merge SHA + the Phase 4 benchmark result at the placeholders.

---

Plan #4 Phase 5 — OAuth + analytics + scheduling + /operations + music import CLI. Outline at `docs/superpowers/plans/2026-05-25-shorts-os-plan-4-render-pipeline.md:2597`.

Re-plan using `superpowers:writing-plans` against the spec §5 (OAuth + analytics), §5.5 (scheduling + /operations), and §8 (music library import) before writing code.

State at chat start:

- Repo `/Users/darius/Downloads/shorts-os`, main, latest commit is Phase 4 close (PR #6 merge SHA: `<FILL_IN_AFTER_MERGE>` — "Plan #4 Phase 4 — Format 2 / Composer / /clips Candidates+Rendered").
- Branch `plan-4-phase-4` has been merged.
- Reddit/YouTube clip ingest is **still blocked** by datacenter-IP anti-bot. Operator-supplied cookies (Option A in Phase 4's Task 1 decision doc) confirmed dead for Reddit (IP-bound session). Phase 5 should reconsider Option B (Bright Data / residential proxy) as the first task — without real clips the compilation format is permanently stuck on placeholder data.
- `compilation_drafts` populates from Composer end-to-end; `render_f2` produces 1080×1920 MP4; promotes to `your_videos` cleanly. Phase 4 smoke result: `<PASS|FAIL — fill in from docs/superpowers/notes/2026-05-27-plan-4-phase-4-benchmark.md>`.
- 3 placeholder `music_tracks` seeded (ffmpeg-synthesized sine-wave tones). Phase 5 §8 import CLI must replace these with real CC0 music.
- 7 placeholder `clip_library` rows seeded for the Cars niche. Once Option B is in place, these should be marked deleted and replaced with real ingest.

Hard rules (carry forward):

- Plain English in chat. Technical docs technical.
- Stop at the end of every phase and hand back a fresh-chat prompt.
- No `@vercel/sandbox` imports outside `src/lib/render/workers/vercel-sandbox.ts` + `scripts/render-worker/`.
- TS strict, no `any`, Zod at boundaries, `server-only` on secret-holding modules.
- `COCKPIT_PASSWORD` in prod is Sensitive — operator drives any /login + UI-paste steps.
- For local dev, unset `ANTHROPIC_BASE_URL` or AI SDK 404s.
- The `plan-4-phase-2-5` captions-overlay branch may have merged by now. If so, Phase 5 can integrate Remotion title-cards / callouts retroactively (Phase 4 Task 18 placeholder); if not, stay off `src/remotion/`.
- **CRON_SECRET on preview is Sensitive and cannot be pulled.** Triggering preview crons requires the operator's shell — Phase 5 should plan around this (either merge-early like Phase 2/3/4, or build a local dispatcher driver).

Phase 4 acceptance gate met: `<FILL IN — one of: (a) end-to-end Format 2 dispatch → Composer → render_f2 → your_videos confirmed in prod; or (b) only render_f2 worker pipeline + callback + promote confirmed, Strategist+Composer+UI buttons unit-tested only and deferred to a Phase 5 verification task>`.

Known gotchas you'll likely re-encounter (from Phases 1-4):

1. Vercel crons only run on production deployments. Don't try to test cron-driven flows on preview.
2. Vercel env updates require a redeploy (or empty-commit bump) for warm function instances to pick up new values.
3. `yt-dlp-wrap` default import is `{ default: <class> }` under tsx ESM — unwrap probe lives in `scripts/render-worker/lib/yt-dlp.ts`.
4. `yt-dlp` standalone pyinstaller binary (not zipapp) is needed for Vercel Sandbox (Amazon Linux 2023, Python 3.9).
5. `/api/clips/ingest-url` requires cockpit session cookie — operator drives UI, you can't curl it directly.
6. `.env.local` `CRON_SECRET` ≠ preview `CRON_SECRET` (per-env values differ). Sensitive vars can't be `vercel env pull`'d locally — they come back as empty strings. Triggering preview crons manually requires the operator's involvement.
7. `assertCronAuth` requires `Authorization: Bearer <CRON_SECRET>` — there is no bypass.
8. Vercel deployment protection is on for the preview environment — even `curl` with the right Bearer fails with 401 at the Vercel layer before the route runs. Use `vercel curl` from the CLI or the Vercel MCP `web_fetch_vercel_url` to bypass SSO; production URLs (`shorts-os-roan.vercel.app`) are not SSO-protected on API routes.
9. The render-worker subdirectory has its own `node_modules` (it's a separate npm package). `ffmpeg-static` and `@ffprobe-installer/ffprobe` live there.
10. The Vercel Sandbox ffmpeg-static binary has `drawtext` but no font is preinstalled — Phase 4 bundled DejaVu Sans Bold under `scripts/render-worker/assets/`. New drawtext callsites should use the same path-resolution pattern.

Useful IDs:

- Supabase project: `jfmjppzjicvbpnlkmxbg`
- Vercel project: `prj_FooiiEYKOWNMZh3YtjoqwkbsWE0M` (team `team_La4nTrN2OOSH8ETfMRUMDhOq`)
- Active channel: `c8edc30f-375d-4b38-b6b0-77fa4b5e59a7` (slug `dyfrx_9754`, Cars niche `c151f4fa-0e49-4379-a21b-d452d4bdab22`)
- Phase 4 placeholder draft + job: see benchmark doc

First step in the new chat: read `docs/superpowers/plans/2026-05-25-shorts-os-plan-4-render-pipeline.md` from line ~2597, then re-plan Phase 5 with `superpowers:writing-plans`.
