# Plan #5 Phase 1 — Sub-phase G: Agents Dashboard + Video Reviewer — Design Spec

Date: 2026-05-31
Branch base: `main` (Sub-phases A–F merged + live on `shorts-os-roan.vercel.app`)
Status: approved scope, ready for implementation plan.

---

## 1. Summary

Sub-phase G wires up two large features whose **full data model already exists in prod but is
completely unconnected** — the §4.8 agent dashboard and the §4.11 pre-publication Video Reviewer —
and builds their premium UI. It is overwhelmingly a *wiring + UI* effort, not a schema build.

Two headline deliverables:

1. **Agents dashboard (§4.8)** at a new `/agents` route (sidebar item "Agents"): a 6-card grid of the
   product assistants with live status, a cross-agent activity feed, an aggregate health pill, and
   per-agent pages (`/agents/[id]`) with **Activity / Memory / Settings / Chat** tabs. Plus the
   per-agent learning loops that write to `assistant_memory`.
2. **Video Reviewer (§4.11)** wired end-to-end: a `review` worker job runs a 7-component QA pass on
   the real rendered MP4 → `video_reviews`, auto-triggered when a video reaches `status='rendered'`;
   a `/lab/[videoId]/review` split-view screen (player + `ReviewScorecard`); an Approve-&-Schedule
   gate (block/revise/ship); operator overrides feed `video_review_feedback` → the Reviewer's memory.

**Explicitly deferred** (not in G): the niche→video **auto-dispatch** (making "Generate from niche"
actually run the orchestrator) and the §4.16 "≥3 posted videos" north-star. Those are a later
sub-phase. G removes the *blockers* (the QA gate exists; the dashboard is honest) but does not itself
post videos.

## 2. Goals / non-goals

**Goals**
- Surface what every agent is actually doing, in a premium 9/10 UI, reading real data (no façades).
- Make the Video Reviewer a real pre-publish QA gate on real rendered media.
- Close two §4.16 "not done" criteria: "all 6 agent cards render with correct status" and
  "`/lab/[videoId]/review` works end-to-end on ≥1 real rendered video."

**Non-goals (G)**
- Niche→video auto-dispatch / orchestrator fire-and-forget from "Generate from niche".
- Activating the Analyst (Phase 4) or Editor (Phase 3) agents — they stay honest "Coming in Phase N"
  placeholders (`assistants.is_enabled = false`).
- Re-introducing a "Mission Control" primary shell. Landing stays `/niches`.

## 3. The reframe — what already exists

Built in Sub-phase A (live in prod), never wired to UI or written to by any agent:

**Agent dashboard schema** (`supabase/migrations/20260528000004_assistants.sql`):
- `assistants` — 6 rows seeded (`20260528000010_seed_assistants.sql`): `niche_scout`,
  `watch_list_curator`, `generator`, `video_reviewer` (enabled) + `analyst`, `editor_copilot`
  (`is_enabled = false`). Columns: `id, display_name, role_description, icon_name, accent_color_var,
  is_enabled`.
- `assistant_status` — `assistant_id, state ('idle'|'working'|'waiting'|'errored'), current_activity,
  updated_at`.
- `assistant_activity_log` — `id, assistant_id, activity_type, summary, payload jsonb, created_at`.
- `assistant_memory` — `id, assistant_id, memory_key, memory_value jsonb, confidence,
  last_updated_at, editable_by_user`, unique `(assistant_id, memory_key)`.
- `assistant_settings` — `assistant_id, settings jsonb, updated_at`.
- `assistant_chat_threads` — `id, assistant_id, started_at, last_message_at, title`.
- `assistant_chat_messages` — `id, thread_id, role ('user'|'assistant'|'system'), content, created_at`.

Existing repo `src/lib/supabase/repositories/assistants.ts` already exports: `registerAssistant`,
`listAssistants`, `getAssistantById`, `updateAssistantStatus`, `upsertAssistantMemory`,
`listAssistantMemory`. G **extends** this repo (activity-log read/write, settings read/write, chat
thread/message CRUD) — it does not replace it.

**Video Reviewer schema** (`supabase/migrations/20260528000005_video_reviews.sql`):
- `video_reviews` — per-component score+verdict for `title, thumbnail, hook, pacing, description_seo,
  audio, visual`; `overall_verdict ('ship'|'revise'|'block')`; `suggestions[]`, `strengths[]`;
  `your_video_id`.
- `video_review_feedback` — operator action per suggestion (for the learning loop).
- `your_videos.review_id` FK already exists (`20260528000008_your_videos_additions.sql`).
- Repo `src/lib/supabase/repositories/video-reviews.ts`: `insertVideoReview`,
  `getVideoReviewByVideoId`, `recordReviewFeedback` (built + tested, never called in app code).
- UI components `src/components/compositions/review-scorecard.tsx` +
  `review-suggestion-item.tsx` exist and are currently orphaned.

**Rendering is real** (`scripts/render-worker/`): Remotion + Cartesia TTS + ffmpeg/ffprobe +
Claude vision + Whisper captions produce real MP4s with audio. The Reviewer can honestly run
ffmpeg/ffprobe/vision components against the artifact.

## 4. Naming subtlety — `assistants` vs `agents`

The codebase has **two** distinct concepts; the dashboard renders `assistants`:

- `assistants` (this spec / §4.8 product personas): `niche_scout`, `watch_list_curator`, `generator`,
  `video_reviewer`, `analyst`, `editor_copilot`. The 6 dashboard cards.
- `agents` (Plan #4 orchestrator workers): `strategist`, `composer`, `writer`, `voice_coach`,
  `director`. These are the **internal pipeline** of one orchestrator run.

**Mapping:** an orchestrator run (the `agents` pipeline, producing `jobs`/`agent_messages`/`decisions`)
rolls up under the **Generator** assistant. So the Generator card's status/activity is derived from
the active `produce_video` job + its agent messages. Other assistants map to their own work:

| Assistant | Status/activity source | Learning-loop signal |
|---|---|---|
| `niche_scout` | clustering/scoring/classify crons (`cluster-niches`, `classify-observations`, scoring) | sealed predictions vs actual (`prediction-close` cron + `niche_predictions`) |
| `watch_list_curator` | `watch-list-sync` / `performance-sync` crons | channel outlier counts over time |
| `generator` | active `produce_video` job (`jobs`/`agent_messages`) via the orchestrator | operator script edits (`your_videos.generator_edits`) |
| `video_reviewer` | the new `review` worker job | `video_review_feedback` per suggestion |
| `analyst` | none — disabled placeholder (Phase 4) | n/a |
| `editor_copilot` | none — disabled placeholder (Phase 3) | n/a |

## 5. Migrations (2, additive, operator-gated)

Both small, additive, and require explicit target-named in-chat authorization
("Apply migration `<name>` to prod `jfmjppzjicvbpnlkmxbg`.") before applying:

1. `add_review_job_type` — `ALTER` the `render_jobs.job_type` CHECK from
   `('clip_ingest','render_f1','render_f2','upload')` to additionally allow `'review'`.
2. `your_videos_generator_edits` — `ADD COLUMN IF NOT EXISTS generator_edits jsonb` on `your_videos`
   (Generator learning loop). If, during planning, the Generator loop is judged out of scope, this
   migration drops and the Generator card simply shows activity without a learning signal — but it is
   IN scope per the approved design.

Everything else (`assistants*`, `video_reviews`, `video_review_feedback`, `your_videos.review_id`)
already exists in prod. **Pre-flight:** confirm those tables exist in prod before wiring (they ship in
Sub-phase A migrations, which are live). Regenerate `src/lib/supabase/types.ts` after applying the two
new migrations.

## 6. Architecture decisions

- **Liveness:** the `/agents` dashboard and per-agent Activity tab refresh by **15s polling** (server
  components re-fetch / client poll a lightweight JSON route). The Lab's existing SSE stream is reused
  only inside the active-run pane, not the dashboard. Rationale: simple + robust on Fluid Compute; a
  status overview does not need push.
- **Reviewer execution:** a **`review` worker job** (new `render_jobs.job_type`) auto-enqueued when a
  video transitions to `status='rendered'`. The render-dispatcher cron claims it; a new
  `scripts/render-worker/handlers/review.ts` runs the 7 components against the MP4 (it already has
  ffmpeg/ffprobe/Claude-vision/blob), writes `video_reviews`, sets `your_videos.review_id`, and POSTs
  back. Rationale: the serverless Next runtime can't run ffmpeg; the worker already has every tool.
- **Health pill target:** build a small **`/admin/health`** page (aggregate cron/source/agent status)
  as the pill's destination, matching §4.8/§4.12. Approved over folding health into the dashboard top
  bar.
- **Agent Chat engine:** one generic AI-SDK chat engine + a **per-assistant tool registry**. Each
  enabled assistant gets a system prompt + a fixed set of **read-only** tools wrapping its existing
  repos. Threads/messages persist to `assistant_chat_threads` / `assistant_chat_messages`. Uses the
  same AI Gateway client the classifier/orchestrator already use. Disabled assistants' Chat tab shows
  the "Coming in Phase N" state.

## 7. Thread 1 — Agents dashboard (`/agents`)

**Nav:** add `Agents` item to `src/components/layout/app-sidebar.tsx` (icon e.g. `bot`/`cpu`), placed
after `Lab`. `resolveActiveHref` already handles longest-prefix, so `/agents/[id]` highlights Agents.

**`/agents` page (server component, `AppShell` + `AppSidebar`):**
- Top bar: aggregate **health pill** (`all healthy` green / `N need attention` amber / red on
  critical), click → `/admin/health`. Derived from cron freshness + any `errored` assistant.
- **6 `AgentCard`s** in a 3×2 grid (1×6 mobile). Each card: icon + display name + role (1 line);
  status dot + `current_activity` line (from `assistant_status`); latest 3 `assistant_activity_log`
  entries (truncated). Disabled assistants render a muted card + "Coming in Phase N" pill. Click →
  `/agents/[id]`. Cards stagger-animate in (Framer Motion, ~50ms stagger).
- Below the grid: paginated **cross-agent activity feed** (most recent `assistant_activity_log` across
  all assistants), each row linking to its agent.
- 15s polling refresh. Premium empty/loading states (skeleton cards w/ shimmer).

**Writers (make the data real):** the 4 active assistants must emit status + activity at their real
work points. Implement a thin `recordAssistantActivity(assistantId, type, summary, payload)` +
`setAssistantStatus(...)` (extend `assistants.ts`) and call them from:
- `niche_scout`: `cluster-niches`, `classify-observations`, scoring cron routes (start → `working`,
  end → `idle` + activity row summarizing N clusters / scored).
- `watch_list_curator`: `watch-list-sync` / `performance-sync` crons.
- `generator`: the orchestrator (`src/lib/agents/orchestrator.ts`) on `job_started` →
  `working` and `job_completed`/`job_failed` → `idle`/`errored`, with an activity row per run.
- `video_reviewer`: the new review handler (Thread 3).

## 8. Thread 2 — Per-agent pages (`/agents/[id]`)

Tabbed page (`Activity | Memory | Settings | Chat`), premium tab UI. `[id]` ∈ the 6 assistant ids;
404/`notFound()` otherwise. Disabled assistants show a placeholder hero + the "Coming in Phase N"
state across tabs.

- **Activity** — full `assistant_activity_log` for this assistant, filterable by `activity_type`,
  paginated, 15s poll. Reuses the feed-row component from Thread 1.
- **Memory** — `assistant_memory` rows as editable cards: `memory_key`, `memory_value` (jsonb,
  rendered + editable), `confidence`, `last_updated_at`. Operator can edit/override/delete (writes via
  `upsertAssistantMemory` / a new delete). Honest empty state when an agent has learned nothing yet.
- **Settings** — `assistant_settings.settings` jsonb form, **per-assistant schema**: model (vetted AI
  Gateway string dropdown), frequency (cron, where applicable, read-only-with-note if cron-fixed),
  thresholds (e.g. confidence floors), taste sliders (e.g. Niche Scout "more proven ↔ more
  first-mover"). Validated with zod; only known keys per assistant.
- **Chat** — `AgentChatThread`: multi-turn, persistent threads (`assistant_chat_threads/messages`).
  Streamed responses. The assistant answers in the context of its domain via its **read-only tool
  registry** (§6). Thread list + new-thread; messages stream token-by-token. Tool calls surfaced
  inline (e.g. "queried niche_clusters → 12 rows").

**Per-assistant read-only tool registries (Chat):**
- `niche_scout`: list/get niche clusters, scores, sealed predictions.
- `watch_list_curator`: list watched channels, outlier stats, recent uploads.
- `generator`: list recent jobs/decisions, drafts (`your_videos`), the active run.
- `video_reviewer`: list/get `video_reviews`, `video_review_feedback`.

## 9. Thread 3 — Video Reviewer (§4.11)

**Trigger:** the `/api/render/complete` callback is where a render job's success transitions the video
to `status='rendered'`. At that point (and only on a `render_f1`/`render_f2` success, not on a `review`
or `upload` completion), enqueue a `render_jobs` row with `job_type='review'` for that `your_video_id`,
idempotently (skip if a `video_reviews` row already exists for the video).

**Worker handler** `scripts/render-worker/handlers/review.ts` — runs 7 components on the MP4 +
script + niche-cluster references, each returning `pass|needs_work|fail` + score 0–1 + 0–3 suggestions:
1. **Title** — LLM + reference titles from the same `niche_cluster` top performers.
2. **Thumbnail** — Claude vision + reference thumbnails (visual hierarchy, face/text, contrast).
3. **Hook** — first 3s: transcript (script) + visual analysis (curiosity gap, urgency).
4. **Pacing** — ffmpeg scene-detect cut frequency + loudness/energy curve vs niche-winning patterns.
5. **Description SEO** — keyword presence vs niche, length, hashtag/link relevance.
6. **Audio** — ffmpeg RMS levels, clipping detection, noise estimate.
7. **Visual** — ffprobe resolution/frame-rate consistency + watermark CV pass.

Writes `video_reviews` (+ `overall_verdict`), sets `your_videos.review_id`, updates the
`video_reviewer` assistant status/activity, POSTs back. Pure scoring/aggregation logic (component →
verdict, overall verdict roll-up) lives in a testable module; the ffmpeg/vision calls are the
side-effecting edges.

**UI `/lab/[videoId]/review`** (premium split-view, `AppShell`):
- Left: rendered video player (Blob URL) with scrubber + transcript-overlay toggle.
- Right: `ReviewScorecard` (existing component) — 7 expandable component rows; strengths band on top,
  suggestions band below; each suggestion can show a `Reference:` comparator thumbnail link.
- Bottom: **Approve & Schedule** — disabled when `block`; warning state when `revise`; active for
  `ship`. On approve → existing schedule flow (`/api/lab/schedule`). Operator override (ship anyway /
  reject) requires a reason → `video_review_feedback` (learning signal).
- Honest states: "review in progress" (job queued/running), "review failed" (with retry), no-review.
- Entry points: a "Review" action on rendered rows in `/lab/drafts`.

## 10. Cross-cutting — learning loops → `assistant_memory`

Slow continuous improvement; memory rows are editable key-values:
- **Niche Scout** — on `prediction-close`, fold accuracy (within/above/below) into memory
  (e.g. `prediction_accuracy` rolling stats).
- **Video Reviewer** — each `video_review_feedback.action_taken` up/down-ranks suggestion classes in
  `assistant_memory['video_reviewer']`.
- **Generator** — diff operator script edits vs the draft into `your_videos.generator_edits`, summarize
  into Generator memory.
- **Watch-list Curator** — periodic outlier-count rollup; zero-signal channels flagged for eviction.

These are deliberately lightweight writes at existing cron/callback points, not a new training system.

## 11. UI / premium bar

9/10 minimum, consistent with the design system used by `/niches` and `/sandbox`: translucent
sidebar, design tokens (no hardcoded values), Framer Motion (staggered card entrance, tab transitions,
status-dot pulse on `working`), Cmd/Ctrl-K palette additions (`Agents: [name]`, `Mission Control`
removed), skeleton/shimmer loading, designed empty states. Status dots: `idle` neutral, `working`
accent + pulse, `waiting` amber, `errored` red. Reviewer verdict colors: ship green, revise amber,
block red. Reference: §4.8 card structure + §4.11 split-view.

## 12. Testing & verification

- TS strict, **no new `any` / `as unknown as`** in source.
- Vitest (pure logic): activity-feed mapping, health-pill derivation, review component→verdict +
  overall-verdict roll-up, per-assistant settings zod schemas, chat tool-registry shape, generator-edit
  diffing. Side-effecting edges (ffmpeg/vision/LLM) are thin and mocked.
- `env -u ANTHROPIC_BASE_URL npm run build` passes; `npx tsc --noEmit` clean; no new vitest failures
  beyond the known env-gated/live-DB baseline.
- **UI 9/10 verification is operator-gated on the Vercel preview** (local pages 500 with blank
  `.env.local`, same wall as C–F). Capture: `/agents` grid, a per-agent page across all 4 tabs
  (Niche Scout is the richest), `/lab/[videoId]/review` on a real rendered video, `/admin/health`.

## 13. Success criteria (G "done")

- `Agents` nav item live; `/agents` renders all 6 cards with **real** status — 4 active agents show
  genuine status/activity from their work points; Analyst/Editor honest "Coming in Phase N".
- Per-agent pages: Activity (real log), Memory (editable, persists), Settings (validated, persists),
  Chat (multi-turn, tool-using, streamed) all functional for the 4 active agents.
- `/admin/health` renders aggregate status; dashboard pill links to it.
- A real video reaching `status='rendered'` auto-produces a `video_reviews` row via the worker; its
  `/lab/[videoId]/review` screen renders the scorecard + player; Approve-&-Schedule gating respects
  ship/revise/block; an override writes `video_review_feedback`.
- The four learning-loop writes land in `assistant_memory`.
- Closes §4.16: "all 6 agent cards render with correct status" + "`/lab/[videoId]/review` works
  end-to-end on ≥1 real rendered video."

## 14. Out of scope / deferred (→ later sub-phase)

- Niche→video **auto-dispatch** (orchestrator fire-and-forget from "Generate from niche") and the
  §4.16 "≥3 posted videos" north-star.
- Analyst (Phase 4) + Editor (Phase 3) activation.
- Live onboarding scan progress feed; classifier prompt-version capture; cost persistence
  (AI Gateway/Resend); Resend verified domain; comment ingestion. (Carried from F.)

## 15. Hard rules (carry-forward)

- TS strict, no `any`.
- **This is NOT the Next.js you know** — read `node_modules/next/dist/docs/` before writing Next code.
- Premium UI 9/10 (reference `/sandbox` + the niche pages).
- Prod migrations operator-gated; target-named in-chat authorization required (classifier rejects
  vague "yes"). Phrase: "Apply migration `<name>` to prod `jfmjppzjicvbpnlkmxbg`."
- `-u ANTHROPIC_BASE_URL` for local `npm run dev`.
- Do it yourself via Bash/MCP/CLI; only ask for atomic operator inputs.
- RLS remains disabled on public tables (pre-existing); new code inherits this.

## 16. Open questions / risks

- **Chat tool-use cost/latency** — read-only tools cap blast radius, but multi-turn tool-calling per
  agent is the largest new surface. Mitigation: a small fixed tool set per agent; stream responses.
- **Reviewer component fidelity** — watermark CV + scene-detect are the fuzziest; acceptable to land
  them as best-effort heuristics with honest "low confidence" verdicts rather than overclaiming.
- **Generator activity granularity** — mapping 5 orchestrator workers onto one Generator card may lose
  detail; the per-agent Activity tab can link into the Lab run pane for the full step trace.
- **Prod schema pre-flight** — confirm `assistants*` + `video_reviews` are actually present in prod
  before wiring (expected: yes, from Sub-phase A).
