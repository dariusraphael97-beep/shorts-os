# Niches → Video "Generate Spine" — Design

**Date:** 2026-06-08
**Branch:** `feat/niche-finder-dominatable`
**Status:** Design approved (brainstorm), pending implementation plan.

## Context

The longform reference-driven generation pipeline works end-to-end and has produced
operator-approved videos (latest: `B58-engine-800hp-v2.mp4`). But it is entirely
**script-driven**: a human dispatches `runLongformPipeline` and then hand-invokes the
local render-worker. The `/niches` dashboard already has a "Generate now" button, but it
is a **dead end** — `POST /api/niches/[id]/generate` creates a 45-second short stub in
`your_videos` and stops; it is not connected to the proven longform pipeline.

This sub-project — the **Generate Spine** — closes the gap between "Claude runs scripts"
and "the product makes the video." It is slice #1 of "productize into `/niches`" (chosen
over: real-niche ingestion, Style Scout, headless render — all deferred to their own
slices).

## Goal

From the `/niches` dashboard, one click runs the **proven** longform pipeline against a
dominatable niche and ends in a **playable video in the app**, with a cheap planning phase,
an operator approval checkpoint before any credits burn, then the heavy render — all
visible in a dedicated cockpit.

## Decisions (from brainstorm)

1. **First slice = the Generate Spine** (not ingestion / Style Scout / headless).
2. **Two entry points:** a top-of-`/niches` "Generate my best niche" hero (autonomous
   pick) **and** per-niche "Generate" on each card/detail.
3. **Approval checkpoint before render.** Plan is cheap/fast; render burns ~16–25 min +
   Higgsfield/ElevenLabs credits, so the operator reviews and approves the plan first.
4. **Dedicated run cockpit** at `/niches/studio/[draftId]` (not inline, not a drawer) —
   a focused, URL-addressable control room you can leave mid-render and return to.
5. **Seed a few real niches now** via a one-off scan of the proven playbook (needs
   `YOUTUBE_API_KEY`) so the spine is usable immediately. This is a small down payment on
   slice #2; full productized ingestion stays separate.

## Architecture

Three stages with the operator checkpoint in the middle:

```
Entry (hero auto-pick OR per-niche Generate)
        │  creates draft (your_videos, status=draft) linked to the niche cluster
        ▼
PHASE 1 — PLAN  (cheap, seconds–~1 min, no credits)
        │  writer → style-picker → beat-planner → voice
        │  REUSES runLongformPipeline in a NEW "plan-only" mode:
        │  persists draft.longform_plan, does NOT enqueue a render job
        ▼
CHECKPOINT  (cockpit shows hook, script, style/model, beat count, voice,
        │   length, est. credits + time → Approve / Tweak / Regenerate / Cancel)
        ▼  on Approve
PHASE 2 — RENDER  (heavy, ~16–25 min, credits)
        │  enqueue render_jobs row (job_type=render_longform, payload={your_video_id})
        │  LOCAL render-worker daemon: claim_render_jobs → runRenderLongform →
        │  upload mp4 → POST /api/render/complete → draft.status=rendered + video url
        ▼
DONE  (cockpit plays the finished video; saved to drafts)
```

The render path is **forward-compatible with the deferred cloud slice (#4)**: same
`render_jobs` queue, same `runRenderLongform` handler, same callback. Only the *runner*
differs (local daemon now → Vercel Sandbox later).

## Units (each small, well-bounded, testable)

### 1. Auto-pick selector — `src/lib/niches/auto-pick.ts`
- **Does:** given the current week's `niche_clusters`, returns the single best dominatable
  niche to generate (clusterId + a short "why").
- **How used:** the hero calls it to preview + launch the top pick.
- **Depends on:** existing `src/lib/scoring/select.ts` (`assignBand`, `selectDigest`) —
  reuse its ranking; do not invent a new score. Returns `null` when no eligible clusters
  exist (drives the hero's empty state).

### 2. Cluster → longform brief — extend `src/lib/niches/brief.ts` (or wherever `clusterToBrief` lives)
- **Does:** converts a niche cluster into a **longform** generation input: topic/title,
  reference video IDs (for the reference-driven render), target duration (~210s), and a
  style hint derived from the niche.
- **Why new:** today's `clusterToBrief` produces a **45-second short** brief; the spine
  needs a longform brief. Keep the short path intact or retire it (see Open Seams).

### 3. Plan-only mode + Approve endpoint
- **Plan-only mode:** `runLongformPipeline` (or a thin wrapper) gains a flag that persists
  the draft + `longform_plan` but **skips the render-job enqueue**. The exact seam (a
  `planOnly` flag on the pipeline vs. splitting enqueue out of the orchestrator) is
  resolved in the plan — see Open Seams.
- **Plan API:** `POST /api/niches/studio/plan` `{ clusterId }` → SSE stream (reuse
  `encodeSseEvent` + the existing event shape) → ends with a `draftId`. Mirrors the
  existing `/api/lab/longform/dispatch` route, minus render.
- **Approve API:** `POST /api/niches/studio/[draftId]/approve` → inserts exactly one
  `render_jobs` row (idempotent: a second call must not double-enqueue). Sets
  `draft.status='rendering'`.

### 4. Local render-worker daemon — `scripts/render-worker/poll.ts` + `npm run render-worker`
- **Does:** `while(true)` loop → `claim_render_jobs(1)` → route by `job_type`
  (reuse the switch from `run.ts`) → run `runRenderLongform` locally (Higgsfield CLI +
  ffmpeg) → on success/fail update `render_jobs` and POST the callback.
- **Notes:** runs on the operator's machine with `.env.local` + `HIGGSFIELD_ENABLED=1`.
  Wraps the existing one-shot `run.ts` logic; adds polling, backoff, and graceful
  shutdown. Honors the existing `reset_stuck_render_jobs` watchdog.

### 5. Cockpit route + UI — `src/app/niches/studio/[draftId]/page.tsx` + client components
- **Does:** a phase state machine — `planning → checkpoint → rendering → done | error` —
  driven off `draft.status` + the plan + render-job state.
  - `planning`: SSE from the Plan API; live agent step list + token stream (reuse
    `LongformRunPane` patterns).
  - `checkpoint`: the approve card (hook, script, style/model, beats, voice, length,
    est. credits + time). Approve / Tweak / Regenerate / Cancel.
  - `rendering`: progress from polling render-job state (+ frame thumbnails if available);
    "leave and come back" safe.
  - `done`: video player + Download / Open in Lab / Generate another.
- **Reuses:** design-system tokens, `Card`/`Button`, `HoverLift`/`Tappable`, sparkline
  patterns.

### 6. Hero — `src/components/compositions/generate-best-niche.tsx` + mount on `/niches`
- **Does:** top-of-feed CTA "Generate my best niche," previews the auto-pick (title +
  the dominatable stats), routes to the cockpit after kicking off Phase 1. Disabled empty
  state when `auto-pick` returns null.

### 7. Cost/time estimate — `src/lib/longform/estimate.ts`
- **Does:** from beat count + model + voice provider, returns estimated credits + wall
  time for the checkpoint. Pure function; unit-tested with known fixtures (e.g. 68 beats
  nano_banana_2 ≈ 136 cr / ~18 min, matching observed B58/bird runs).

## Data flow & state

- **Source of truth:** the `your_videos` draft row. `status` enum already supports the
  lifecycle: `draft` (planning/planned) → `rendering` → `rendered` → `posted` | `failed`.
  `longform_plan jsonb` holds the plan; `source_niche_cluster_id` links the niche;
  the finished video url lands on the draft (existing column / callback path).
- **Cockpit reads:** draft row + (during render) the linked `render_jobs` row.
- **Planned vs. draft:** "plan done, awaiting approval" is represented while `status='draft'`
  with a populated `longform_plan` and no render job yet (or a dedicated sub-flag if the
  plan finds the boolean insufficient — decide in the plan; prefer reusing existing
  columns over a migration).

## Schema

**Goal: zero or minimal new schema.** `your_videos` already has `status`, `longform_plan`,
`source_niche_cluster_id`. `render_jobs` + `claim_render_jobs` + `reset_stuck_render_jobs`
already exist. If a clean "awaiting approval" state can't be derived from existing columns,
add a single nullable column (e.g. `plan_approved_at timestamptz`) rather than a new table.

## Error handling & edge cases

- **Phase 1 agent failure:** cockpit shows the failed step + Retry (re-run the plan).
- **Render failure:** existing watchdog (`reset_stuck_render_jobs`, 3 attempts → `failed`);
  cockpit surfaces failure + Re-enqueue.
- **Worker not running:** the render job sits `pending`. The cockpit detects staleness
  (job pending with no claim for N seconds) and tells the operator to start the local
  worker (`npm run render-worker`). (A lightweight worker heartbeat is optional polish.)
- **No eligible niche:** hero shows a disabled empty state pointing at ingestion / the
  seed step.
- **Credit exhaustion** (ElevenLabs free tier): the render handler already has fallbacks;
  surface the error verbatim in the cockpit.
- **Double-approve / double-generate:** approve is idempotent; the cockpit disables the
  button after the first enqueue.

## Enabling task — seed a few real niches

A one-off task (not part of the recurring pipeline): run the proven playbook
(`/tmp/niche-scan.mjs` logic — recent high-view search → `channels.list` for subs +
`publishedAt` age → rank new(<365d) + bestVideo≥300K + views/subs≥3 by
`sqrt(squash(ratio)·squash(views))·recency`) and write a handful of real dominatable
niches into `niche_clusters` (mapped to the existing cluster shape, with
`example_video_ids`, `channel_count`, `avg_views`, `first_seen_at`, scores,
`explainability_top_signals`). Requires `YOUTUBE_API_KEY`. This makes both entry points
demoable immediately and is a down payment on slice #2 (productizing channel-age
`publishedAt` → `ClusterInputRow` → firstMover in the real ingestion).

## Testing (TDD per repo norm — currently 612 green)

- **Unit:** auto-pick selection (ties, empty → null); cluster→longform-brief mapping;
  cost/time estimate fixtures; plan-only mode persists plan + does **not** enqueue render;
  approve enqueues **exactly one** render job (idempotent); worker poll claims → routes →
  callbacks (success + failure); cockpit reducer transitions.
- **Integration:** Plan API SSE happy path (ends with draftId); approve → one `render_jobs`
  row with correct payload.
- **Hygiene:** app + render-worker `tsc` clean. Any pure helper the worker imports must be
  mirrored into `scripts/render-worker/lib/` (the worker cannot import `src/*`).

## Reuse map

**Reuse:** `runLongformPipeline` + all longform agents; `runRenderLongform` handler;
`render_jobs` queue + `claim_render_jobs` + `reset_stuck_render_jobs`; `/api/render/complete`
callback; `encodeSseEvent` + dispatch SSE event shape; `scoring/select.ts`;
design system (`NicheCard`, `Card`, `Button`, `HoverLift`, `Tappable`, sparklines),
`LongformRunPane` patterns.
**Build:** cockpit route + UI, plan-only mode + Plan/Approve APIs, auto-pick selector,
cluster→longform brief, cost/time estimate, local worker daemon, hero, seed-niches one-off.

## Open seams to resolve in the implementation plan

1. **Plan-only seam:** exactly where in `runLongformPipeline`/orchestrator the render-job
   enqueue happens, and whether to add a `planOnly` flag or split enqueue into the Approve
   endpoint. (Inspect `src/lib/agents/longform/orchestrator.ts` + `deps.ts`.)
2. **Finished-video url field:** confirm which column the callback writes the mp4 url to and
   how the Lab review already reads it, so the cockpit reuses the same path.
3. **`canGenerate` gating:** today a card's Generate requires "add to watch-list." For
   one-click autonomy, drop or default-enable that gate for native-fit niches.
4. **Short vs. longform niche-generate:** repurpose `POST /api/niches/[id]/generate` to the
   longform spine (preferred, per the pivot) vs. add a new endpoint and retire the short
   stub.

## Out of scope (deferred slices)

- **#2 Real-niche ingestion** — productizing the scanner + channel-age into the recurring
  pipeline (this slice only seeds a handful one-off).
- **#3 Style Scout** — auto-detecting + recreating each niche's winning style (this slice
  uses the existing presets + the checkpoint's style override).
- **#4 Headless render** — moving the worker to the cloud (this slice keeps it local).
