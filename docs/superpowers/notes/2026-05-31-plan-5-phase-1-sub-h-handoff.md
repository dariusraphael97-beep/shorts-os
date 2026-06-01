# Plan #5 Phase 1 Sub-phase H — handoff (2026-06-01)

Branch: `plan-5-sub-h-auto-dispatch` (off `plan-5-sub-g-agents-reviewer` → F → E → D → C → B; main at B).
Built via subagent-driven-development (fresh implementer + spec/quality review per task).
Spec: `docs/superpowers/specs/2026-05-31-plan-5-phase-1-sub-h-design.md`.
Plan: `docs/superpowers/plans/2026-05-31-plan-5-phase-1-sub-h.md`.

## Preflight audit (prod jfmjppzjicvbpnlkmxbg, 2026-06-01, read-only)

- **Rendered videos:** 1 in `rendered` status (since 2026-05-29) but `review_id IS NULL` — it
  predates G's review auto-enqueue, so it never got a scorecard.
- **`video_reviews` rows:** none linked to a video yet → **G's review pipeline is UNVERIFIED on a
  real render.** The first auto-dispatched H video is the verification (Task 8 Step 6).
- **render_jobs history:** `render_f1` 6 succeeded / 6 failed; `render_f2` 1/2; `upload` 0/4 (all
  failed); `clip_ingest` 1/9. Takeaway: the render_f1 path itself works; upload has never succeeded
  (worth watching when we first post).
- **Niche-sourced videos (`source_niche_cluster_id NOT NULL`):** none → auto-dispatch is genuinely
  new ground; the §4.16 "≥3 posted from niche output" loop has not started.

## Implications for H
- Build auto-dispatch as planned; its first end-to-end run closes G's review-pipeline verification.
- Keep an eye on the `upload` job (0 successes so far) when the first niche video is posted.

---

## ⚠️ OPERATOR TODO (browser-only — the things I could NOT self-verify)

Local pages 500 with a blank `.env.local` (same wall as C–G), so the 9/10 UI bar and the live
behaviors below can only be confirmed on the deployed Vercel preview. No prod migrations this
sub-phase (see Migrations), so this is purely the browser pass:

1. **Niche → video auto-dispatch, end-to-end (this also CLOSES G's review-pipeline verification).**
   On the preview, open `/niches`, click **Generate** on a `native` niche. Confirm:
   - the card shows the live pipeline strip (Strategist → Writer → Voice → Director), then a
     **"Review →"** link appears on completion (or **"Open Clips →"** if the strategist picked the
     compilation format);
   - a 2nd Generate while one is running shows the "A generation is already running" toast;
   - following "Review →" lands on `/lab/[videoId]/review` and — once the 60s render-dispatcher cron
     renders it — a **`video_reviews` scorecard** appears (the review page polls). **This is the first
     real `video_reviews` row** (preflight audit found none), so eyeball the scorecard.
   - Then actually **post** the video (Approve & Schedule / Upload). The `upload` job has **0 prior
     successes** in prod (preflight) — watch it. Getting ≥3 niche-Generated videos posted is the
     §4.16 gate.
2. **Premium-UI pass** on the rebuilt surfaces (the 9/10 bar — verify against `/niches`, `/agents`):
   - `/lab` — elevated ready-to-dispatch + active-run interiors; the recent-drafts **table** with
     status pills, **verdict badges** (ship/revise/block), and Render/Review/Upload row actions.
   - `/lab/drafts` — premium status-grouped table (same row), empty/loading states.
   - `/clips` — `PageHeader` + rebuilt Inbox/Candidates/Rendered card interiors.
3. **Onboarding first-scan feed on a CLEAN DB** — run onboarding end-to-end; after finish, confirm the
   live scan checklist (Searching YouTube → Classifying → Finding niches → "N niches found") and that
   "See your niches →" lands on `/niches` with real clusters.

## What Sub-phase H ships (3 workstreams, 15 build tasks)

### Workstream 1 — Niche → video auto-dispatch (priority)
- Orchestrator (`runPipeline`) now accepts `sourceNicheClusterId` + `scriptBrief` and threads them
  onto the **explainer-branch** `your_videos` draft (so prediction-close can close the loop). The
  compilation branch (a `compilation_drafts` row) is intentionally left unlinked — deferred.
- `src/lib/agents/auto-dispatch.ts` `drainPipeline`: drains the orchestrator, and on completion
  auto-enqueues `render_f1` **only** for `your_videos` drafts (compilation → skipped, continues in
  `/clips`). Best-effort; never throws (runs in `after()`).
- `POST /api/niches/[id]/generate` rewritten: cluster→brief→manual topic, **409 preflight** (one
  generation at a time), then `after(() => drainPipeline(...))` (Next 16 `after`, `maxDuration=300`),
  returns `{ ok, dispatched, topicId }` immediately. The old stub-draft path is deleted.
- `GET /api/niches/[id]/generation?topicId=` — topic-keyed poll (the `jobs` row has no
  `your_video_id`), resolves the produced output across `your_videos`/`compilation_drafts` via pure
  `resolveGenerationResult`.
- Niche Generate UI: `useGeneratePipeline` hook (one-at-a-time, polls the status endpoint) +
  `GenerationProgress` (reuses `PipelineStrip`) wired into `/niches` cards and `/niches/[id]`. Success
  toast deep-links to the review page (or `/clips`).

### Workstream 2 — /lab + /clips interior redesign (§4.16)
- `src/lib/lab/drafts-view.ts` pure `toDraftRow` VM (status label, verdict, status-gated actions).
- New verdict-aware reads (`listRecentVideosWithReview`, `listVideosByStatusWithVerdict`) join
  `video_reviews.overall_verdict` via `your_videos.review_id`.
- `/lab` recent-drafts → premium table w/ verdict badges + Render/Review/Upload actions; ready-to-
  dispatch + active-run interiors elevated (kept the 3-pane model).
- `/lab/drafts` rebuilt as a premium status-grouped table; legacy `rendered-row`/`scheduled-row`/
  `posted-row` deleted (unified into `DraftRow`).
- `/clips` → `PageHeader` + premium Inbox/Candidates/Rendered card interiors.

### Workstream 3 — Live onboarding scan feed (§4.14 step 6)
- `src/lib/onboarding/scan.ts`: `runOnboardingScan` (search→classify→cluster chain, best-effort) +
  pure `assembleScanStatus`.
- `POST /api/onboarding/complete` now returns immediately and runs the chain in `after()`; new
  `GET /api/onboarding/scan-status` exposes live progress.
- `/onboarding` first-scan step: live checklist feed (`scan-feed.tsx`) → "See your niches →".

## Autonomous deviations / decisions (flag any you dislike)
1. **Niche-Generate poll is topic-keyed, not via `/api/lab/jobs/active`** (corrected from the spec
   draft): the `jobs` row has no `your_video_id` column, so a new `/api/niches/[id]/generation`
   endpoint resolves the produced output by `topic_queue_id` across both draft tables.
2. **Compilation-branch auto-dispatch stops at `/clips`** (not auto-rendered) and the compilation
   cluster→outcome linkage is **deferred** (compilation_drafts has no `source_niche_cluster_id`, and it
   would have to survive promotion). Native short (explainer) is the path that feeds the ≥3-posted
   loop. (Per "cut by capability boundary.")
3. **Concurrency = reject the 2nd Generate (409)**, no queue (your call in brainstorm).
4. **`/lab/drafts` inline "Reject" dropped** when unifying rows into `DraftRow` — reject is still
   reachable on `/lab/[videoId]/review`. Added `schedule`/`cancel` actions to the VM instead.
5. **Onboarding scan runs the full 3-job mini-run** (your call) so niches appear at the end, not just
   raw observations.
6. **`TopicBrief.rawPayload` widened to `Record<string, unknown>`** so it satisfies `drainPipeline`'s
   `scriptBrief` without a cast (no consumer reads its sub-fields — verified).
7. **Legacy `--accent-red` token** (a couple of pre-existing onboarding usages) swapped to the
   design-system `--danger` while in those files.

## Verification state
- `npx tsc --noEmit`: **clean** (root). **Zero** new `any`/`as unknown as` in source (idiomatic
  jsonb-read casts + test-only `as never`/`as any` per existing convention).
- `npx vitest run`: **657 passing / 11 failing**. The 11 are the **pre-existing** env-gated/live-DB
  suites (env, gateway, topic-scorer, schema-niches/patterns/topic-queue/viral-observations, server) —
  **same baseline as C–G; zero new failures.** ~38 new H tests all pass (drainPipeline, generation
  reads/status helpers/endpoint, generate route, drafts-view, onboarding scan chain, scan-status,
  onboarding-complete refactor, orchestrator linkage).
- `env -u ANTHROPIC_BASE_URL npm run build`: **passes** (exit 0). New routes register:
  `/api/niches/[id]/generation`, `/api/onboarding/scan-status`.
- Per-task two-stage review (spec + quality) passed for every task; review-caught fixes committed as
  follow-up `fix(plan-5-h)` commits (chip-mapper composer case, brief type annotation, generate-UI
  concurrency/cancelled/toast, verdict-cast narrowing, a stale drafts-view test the implementer missed
  by not running vitest, the `--danger` token).
- **UI + the real auto-dispatch→render→review→post chain were NOT browser/preview-verified** — that's
  the OPERATOR TODO. The render worker was not touched (no `src/*` import risk this sub-phase).

## Migrations
**None.** Everything reused existing schema (`source_niche_cluster_id`, `script_brief`,
`produce_video` jobs, `render_jobs`, `ingestion_runs`, `video_reviews.review_id`). No prod migration
authorization needed this sub-phase.

## Deferred out of H (→ later sub-phases)
- **Compilation → cluster outcome linkage** (compilation videos don't carry `source_niche_cluster_id`
  through promotion). Deviation #2.
- **Concurrency queue** for multiple in-flight generations (chose reject-the-2nd). Deviation #3.
- **Generator edit-capture loop** (still awaits the Phase 3 editor surface — unchanged from G).
- The remaining §4.16 gate is now operator-driven: **post ≥3 niche-Generated videos + observe 7d
  analytics each.** Everything needed to do it is shipped.

## Carry-forward
- Prod migrations need explicit, target-naming in-chat authorization (none needed in H).
- RLS still disabled on all public tables (pre-existing).
- The render worker (`scripts/render-worker`) is a separate Node project — cannot import `src/*`;
  pure helpers shared with it must be COPIED (not touched in H).
- `-u ANTHROPIC_BASE_URL` required for local dev/test/build from a Claude Code shell.
- Implementers must run **vitest** (not just tsc+build) when touching tested modules — a stale
  `drafts-view` test slipped through once because only tsc+build were run.

---

## Fresh-chat kickoff prompt for the next sub-phase (I)

> Continue Plan #5, Phase 1 — start **Sub-phase I**. Repo `/Users/darius/Downloads/shorts-os`.
> Sub-phase H is done and on its preview branch (`plan-5-sub-h-auto-dispatch`): niche **Generate** now
> drives the orchestrator end-to-end via `after()` (compose → auto-render → review, publish operator-
> gated), the `/lab` + `/lab/drafts` + `/clips` interiors are rebuilt to the design system, and
> onboarding has a live first-scan feed. Read the H handoff
> (`docs/superpowers/notes/2026-05-31-plan-5-phase-1-sub-h-handoff.md`) and the master spec
> (`docs/superpowers/specs/2026-05-28-plan-5-creator-copilot-design.md`).
> **Do the H OPERATOR TODO first** (preview pass: auto-dispatch a niche end-to-end → confirm the first
> real `video_reviews` row + post a video; premium-UI pass on /lab, /lab/drafts, /clips; onboarding
> scan feed on a clean DB), so we're building on verified ground and start filling the §4.16 "≥3 posted"
> gate. Then scope/sequence what's left for Phase 1 completion: the remaining §4.12 admin QC surfaces
> (classification-review / prompt-versions / scoring-analysis / ingestion-health / costs), the weekly
> digest send (§4.10) if not yet confirmed, moat-validation logging (§4.13), and any deferred items
> (compilation→cluster linkage, generation queue).
>
> Process: superpowers `writing-plans` → brainstorm scope/sequencing with me first, then subagent-
> driven-development. Hard rules carry forward: TS strict no `any`; this is NOT the Next.js you know
> (read `node_modules/next/dist/docs/` before Next code); premium UI 9/10; prod migrations operator-
> gated (target-named in-chat OK); `-u ANTHROPIC_BASE_URL` for local dev/test/build; the render worker
> can't import `src/*` (copy pure helpers); run vitest when touching tested modules; do it yourself via
> Bash/MCP/CLI.
