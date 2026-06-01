# Plan #5 Phase 1 Sub-phase G — handoff (2026-05-31)

Branch: `plan-5-sub-g-agents-reviewer` (stacks on F → E → D → C → B; main is at B).
Built via subagent-driven-development (fresh implementer + spec/quality review per task).

---

## ⚠️ OPERATOR TODO (do these first — the only things I could NOT self-verify)

The prod migrations are **already applied** and `types.ts` is regenerated/committed — no migration TODO this time. What's left is the browser-only verification:

1. **Preview screenshot / premium-UI + functional pass (operator-gated on Vercel preview).**
   Local pages 500 with blank `.env.local` (same wall as C–F), so the 9/10 UI bar and the live
   behaviors below can only be confirmed on the deployed preview. Capture / verify:
   - **`/agents`** — the 6-card grid (correct status dots: `working` pulses; Analyst/Editor show
     muted "Coming in Phase 4/Phase 3"), the activity feed (+ its empty state), the health pill
     top-right linking to `/admin/health`. Live 15s polling.
   - **`/agents/[id]`** (do `niche_scout`, the richest) — all 4 tabs: Activity (filter + poll),
     Memory (editable JSON cards + invalid-JSON inline error + empty state), Settings (model select,
     0–1 sliders, save confirm + a forced 400), and **Chat** — see #2.
   - **`/admin/health`** — overall pill + cron-freshness list + per-agent status.
   - **`/lab/[videoId]/review`** on a REAL rendered video — the split-view (player + transcript
     toggle | scorecard + suggestions + verdict-gated Approve). Confirm the gating: `block` → Approve
     disabled + "Ship anyway" reason-gated override; `revise` → warning-styled; `ship` → primary.
2. **Chat-tab streaming smoke test (the one thing reviewers flagged as "unverifiable from code").**
   The chat tab compiles cleanly and uses the confirmed `@ai-sdk/react@3` `useChat` + a custom
   `DefaultChatTransport` that sends only `{ threadId, message }` and captures a new thread's id from
   the `x-thread-id` response header. The end-to-end round trip (send → stream tokens → tool chips →
   thread persists → switch threads) has NOT been run in a browser. Send a multi-turn message to Niche
   Scout on the preview and confirm: tokens stream, a tool chip appears when it calls a read tool, the
   reply persists, and switching/creating threads works.
3. **Confirm the review pipeline end-to-end on a real render** — after a `render_f1`/`render_f2`
   succeeds, confirm a `review` render-job auto-enqueues and that `/api/render/complete` persisted a
   `video_reviews` row (linked via `your_videos.review_id`). The worker's ffmpeg AV-analysis regexes
   (`showinfo` scene count, `ebur128` LUFS) and the Claude-vision call are written to documented output
   formats but were never run against a real MP4 in the Sandbox — they degrade to `needs_work` on any
   parse/IO miss, so a miss is non-fatal, but worth eyeballing the first real scorecard.

---

## What Sub-phase G ships (four threads)

Wires the dormant `assistants` + `video_reviews` schema (live since Sub-phase A) into a real agent
dashboard and an end-to-end pre-publish Video Reviewer, with per-agent learning loops.

### Migrations (applied to prod `jfmjppzjicvbpnlkmxbg` + types regenerated)
- `render_jobs_review_type` — adds `'review'` to the `render_jobs.job_type` check constraint.
- `your_videos_generator_edits` — adds `generator_edits jsonb` (future home of the generator
  edit-capture loop; see Thread D / deferred).

### Thread A — Agents dashboard (`/agents`)
- `assistants` repo extended: activity-log read/write, status list, settings read/write, memory delete,
  + chat thread/message CRUD (Thread B). Tested via the repo's mock-client convention.
- Pure `deriveHealthPill` + `assembleDashboard` (view-model assembler) — both TDD'd.
- The 4 active agents now emit live status + activity via a swallowing `reportAssistant` helper:
  `niche_scout` (cluster-niches + classify-observations crons), `watch_list_curator` (watch-list-sync),
  `generator` (orchestrator — both success exits + the failure path). Every write is non-fatal.
- `/api/agents/status` (15s poll JSON) + `/agents` page: card grid (`fadeRise` stagger, `HoverLift`,
  status dots, recent-activity lines), activity feed, health pill. Disabled agents (Analyst/Editor)
  render muted "Coming in Phase 4/Phase 3". `Agents` added to the sidebar nav + the Cmd-K palette.

### Thread B — per-agent pages (`/agents/[id]`)
- Per-assistant settings zod schemas (`validateSettings`, TDD). Memory + Settings API routes
  (`/api/agents/[id]/memory` GET/PATCH/DELETE, `.../settings` GET/PUT-validated).
- Chat engine: a per-assistant **read-only** tool registry (`getToolsForAssistant` + `ASSISTANT_TOOL_IDS`,
  exact-match tested) over existing repos, per-assistant system prompts, and `buildChatStream` (AI SDK v6
  `streamText` + AI Gateway). Streaming chat route `/api/agents/[id]/chat` (POST) with thread/message
  persistence; GET returns threads (or a thread's messages via `?threadId=`).
- `/agents/[id]` tabbed page: Activity (filter + 15s poll), Memory (editable JSON cards), Settings
  (schema-driven controls), Chat (`useChat`, thread list, tool-call chips). Disabled agents get a
  "Coming in Phase N" hero instead of tabs.

### Thread C — Video Reviewer (§4.11)
- Pure `mapReviewToScorecard` / `rollUpOverall` verdict mapping (TDD) + pure `scoreDescriptionSeo` /
  `scoreHookFromTranscript` heuristics (TDD).
- Worker `review` handler (`scripts/render-worker/handlers/review.ts`) — **compute-only**: downloads the
  MP4, runs ffprobe + scene-detect + EBU-R128 loudness + Claude-vision + the pure heuristics → a
  7-component scorecard (title, thumbnail, hook, pacing, description_seo, audio, visual) + suggestions +
  strengths + overall verdict, and RETURNS it (no DB writes). Pure helpers are COPIED into
  `lib/review-heuristics.ts` (the worker can't import `src/*`).
- `/api/render/complete` now (a) auto-enqueues a `review` job when a render succeeds (idempotent,
  non-fatal) and (b) persists the review + links `your_videos.review_id` + sets `video_reviewer` status
  when a `review` job succeeds.
- Feedback route `/api/lab/[videoId]/review/feedback` (POST, zod-validated).
- `/lab/[videoId]/review` split-view (player + transcript toggle | scorecard + suggestions +
  verdict-gated Approve/Reject/Ship-anyway) + a "Review" entry on rendered drafts rows. An
  in-progress poller (`router.refresh()` when the review lands) covers the queued/running state.

### Thread D — admin health + learning loops
- `/admin/health` — pure `aggregateHealth` (TDD) reusing `deriveHealthPill`; page shows the overall
  pill + cron freshness + per-agent status. Added to the admin sidebar (first item).
- Learning loops → `assistant_memory`: pure rollups (`rollupPredictionAccuracy`,
  `rollupReviewFeedback`, TDD). **niche_scout** prediction-accuracy folded in at `prediction-close`;
  **video_reviewer** suggestion-feedback weights folded in at the feedback route. Both non-fatal.

---

## Autonomous deviations / decisions (flag any you dislike)
1. **Repo tests use the mock-client convention, not env-gated live-DB.** The plan suggested
   `describe.skipIf(!SUPABASE_URL)`, but the codebase's actual convention (`video-reviews.test.ts`) is a
   fake-client builder cast `as never` that asserts behavior and ALWAYS runs in CI. Used that — it's
   strictly better (no env gate, real coverage).
2. **B3 chat engine: `stopWhen: stepCountIs(8)`.** AI SDK v6 `streamText` defaults to `stepCountIs(1)`
   (single step), so after the model calls a read tool the turn would END before it synthesizes a text
   answer. Added the multi-step cap so the chat actually replies after tool calls. (Caught in review.)
3. **C3 reviewer scores the REAL `your_videos.description`** (falling back to a title+script proxy when
   null), because `upload.ts` ships that exact column as the YouTube description — scoring a proxy would
   green-light text that differs from what's published. (Caught in review; the original spec select
   omitted the column.)
4. **C4 review enqueue is non-fatal.** The render already succeeded and is marked `rendered`; a blip
   enqueuing the secondary QA pass must not fail the callback (which can't be retried once the job is
   marked succeeded). (Caught in review.)
5. **Generator edit-capture loop is DEFERRED, not faked.** There is no operator script-edit surface in
   Phase 1 (the orchestrator writes `script` once at draft creation; `/lab` routes are only
   reject/render/upload), so `your_videos.generator_edits` has no producer yet. The column + a future
   `rollupGeneratorEdits` slot are ready; documented with a `// NOTE:` in `feedback-memory.ts`. It lands
   with the Phase 3 editor co-pilot. (Per "cut by capability boundary, not stripped quality.")
6. **`@ai-sdk/react@3.0.195` installed** (compatible with `ai@6`) for the chat tab's `useChat`.
7. **"Ship anyway" override reason is `console.info`'d, not persisted** — the schedule route has no
   reason field and I didn't invent one; the reason is an intentional friction gate. If you want an
   audit trail, add a column + wire it later.
8. **Chat-tab thread switching** uses one stable `useChat` instance + imperative `setMessages` (the
   documented v6 pattern). Compiles + reviewed, but streaming is operator-smoke-test-gated (OPERATOR
   TODO #2) — I cannot drive a browser.

## Verification state
- `npx tsc --noEmit`: **clean**. Sub-phase G introduced **zero** new `any`/`as unknown as` in source
  (only idiomatic jsonb-read casts + the worker's `job.payload as {...}` matching `render-f1`).
- `npx vitest run`: **619 passing / 11 failing**. The 11 are the **pre-existing** env-gated/live-DB
  suites (gateway, topic-scorer, env loader, schema-*, server — same baseline as C–F) — **no new
  failures**. The ~97 new G tests (health, dashboard load, settings schemas, chat tools, verdict
  mapping, review components, admin health, feedback-memory, assistants-extended/chat, agents-settings,
  review-feedback) all pass.
- `env -u ANTHROPIC_BASE_URL npm run build`: **passes**. 11 new routes register as `ƒ` (Dynamic):
  `/agents`, `/agents/[id]`, `/admin/health`, `/lab/[videoId]/review`, `/api/agents/status`,
  `/api/agents/[id]/{activity,chat,memory,settings}`, `/api/lab/[videoId]/review{,/feedback}`.
- **Worker** (`scripts/render-worker && npx tsc --noEmit`): clean except 2 **pre-existing**
  `remotion.config.ts` errors (unchanged from before this branch).
- Per-task two-stage review (spec + quality) passed for every task; review-caught fixes are deviations
  #2/#3/#4 above (committed as follow-up `fix(plan-5-g)` commits).
- **UI + chat streaming + the real review pipeline were NOT browser/Sandbox-verified** — OPERATOR TODO.

## Deferred out of G (→ later sub-phases)
- **Niche → video auto-dispatch** (Generate still seeds a draft; the orchestrator isn't fire-and-forget
  dispatched server-side) and the **≥3-posted-videos** cold-start outcome data the learning loops need.
- **Generator edit-capture loop** (awaits the Phase 3 editor co-pilot surface — see deviation #5).
- Deeper design-system rebuild of `/lab` + `/clips` page **interiors** (§4.16 — F only re-shelled them).
- Live onboarding scan-progress feed; comment ingestion; classifier prompt-version capture; AI
  Gateway / Resend cost persistence.

## Carry-forward
- Prod migrations need explicit, target-naming in-chat authorization. Phrase:
  "Apply migration `<name>` to prod `jfmjppzjicvbpnlkmxbg`." (Both G migrations are already applied.)
- RLS still disabled on all public tables (pre-existing).
- `FORMAT_LABELS` duplication from F was already unified (`f970096`).
- The worker (`scripts/render-worker`) is a separate Node project — it cannot import `src/*`; pure
  helpers shared with it must be COPIED (see `lib/review-heuristics.ts`) and kept in sync.

---

## Fresh-chat kickoff prompt for the next sub-phase (H)

> Continue Plan #5, Phase 1 — start **Sub-phase H**. Repo `/Users/darius/Downloads/shorts-os`.
> Sub-phase G is done (Agents dashboard `/agents` + per-agent pages with a tool-using Chat tab, the
> end-to-end Video Reviewer `/lab/[videoId]/review` auto-run on render-complete, `/admin/health`, and the
> niche_scout + video_reviewer learning loops). Read the G handoff
> (`docs/superpowers/notes/2026-05-31-plan-5-phase-1-sub-g-handoff.md`) and the master spec
> `docs/superpowers/specs/2026-05-28-plan-5-creator-copilot-design.md`.
> The big remaining pieces to scope/sequence: **niche → video auto-dispatch** (make Generate actually
> drive the orchestrator end-to-end so we can get ≥3 posted videos and feed the learning loops with real
> outcomes), the **deeper design-system rebuild of `/lab` + `/clips` interiors** (§4.16 — G/F only
> re-shelled them), and the **live onboarding scan feed**. Before any of that, do the G OPERATOR TODO
> (preview UI pass + chat-tab streaming smoke test + confirm a real render produced a `video_reviews`
> row) so we're building on verified ground.
>
> Process: superpowers `writing-plans` → brainstorm scope/sequencing with me first, then
> subagent-driven-development. Hard rules carry forward: TS strict no `any`; this is NOT the Next.js you
> know (read `node_modules/next/dist/docs/` before Next code); premium UI 9/10; prod migrations are
> operator-gated (target-named in-chat OK); `-u ANTHROPIC_BASE_URL` for local dev/test; the render worker
> can't import `src/*` (copy pure helpers); do it yourself via Bash/MCP/CLI.
