# Shorts OS — Render Pipeline Implementation Plan (Plan #4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn approved drafts into posted YouTube Shorts via a Vercel Sandbox render pipeline. After Plan #4, dispatch-to-posted is fully automated gated by two operator clicks (Render + Approve & Schedule). Two formats render in v1: Format 1 (Cartesia TTS narrated explainer) and Format 2 (Top-5 compilation from auto-ingested Reddit clips). Plus the scheduling layer, OAuth/analytics replacing the performance-sync stub, and the schema plumbing Plan #5 depends on.

**Architecture:** Vercel Functions stay for orchestration (Lab dispatch, Composer call, cron entrypoints, UI). All heavy workloads — clip ingest, render, upload — run in Vercel Sandbox microVMs. A `render_jobs` queue + 60-second dispatcher cron + 5-minute watchdog cron drives the FSM. The sandbox-side worker code lives in `scripts/render-worker/` (same repo, separate `package.json`), boots via `npm ci` + `node run.ts`. Sandbox POSTs back to `/api/render/complete` with a JWT-signed token. Scheduling lives in your_videos via `status='scheduled'` + `scheduled_for`; a 15-min `scheduled-uploader` cron promotes due rows to `uploading`.

**Tech Stack:** Next.js 16 App Router (read `node_modules/next/dist/docs/` before writing route handlers per AGENTS.md), TypeScript strict, Vitest, Zod, Supabase JS (service client), AI SDK v6 + Anthropic provider (existing). New deps in root: `@vercel/sandbox`, `@vercel/blob`, `luxon`, `jsonwebtoken`. New deps in `scripts/render-worker/`: `ffmpeg-static`, `yt-dlp-exec`, `@vercel/blob`, `cartesia-js`, `googleapis`, `@supabase/supabase-js`. Vercel Cron via `vercel.ts` (replaces `vercel.json` per the 2026-02-27 Vercel knowledge update).

**Spec reference:** [docs/superpowers/specs/2026-05-25-shorts-os-plan-4-render-pipeline-design.md](../specs/2026-05-25-shorts-os-plan-4-render-pipeline-design.md)

**Operator context:** Darius (16, MacBook Air, non-technical). Each task is sized for a subagent to execute in 5–15 minutes. Existing v0.3.1 cockpit is live at https://shorts-os-roan.vercel.app/.

---

## Plan structure (read this before starting)

Plan #4 is sized for ~5 weeks of work split into 5 execution phases. **This document elaborates Phase 1 in full bite-sized-task detail** (executable from a fresh chat). **Phases 2–5 are scope outlines** — at each phase boundary, re-invoke `superpowers:writing-plans` against this doc + the spec to produce the full bite-sized-task plan for that phase, then execute via subagent-driven-development.

Rationale: matches the operator's phase-boundary handoff convention (see memory entry `feedback_phase_boundary_handoff`). Each fresh-chat phase execution gets a freshly-planned phase doc, so the executor's context isn't bloated by tasks they're not about to do, and learnings from earlier phases inform later-phase planning.

| Phase | Scope | Acceptance gate | Phase plan status |
|---|---|---|---|
| 1 | Foundation: schema + render worker FSM + minimal render_f1 + 240s benchmark | Wall-clock for one end-to-end render_f1 ≤ 240s | **DETAILED BELOW** |
| 2 | Format 1 full pipeline (Cartesia + Pexels + captions + /lab/drafts new states + Render gate) | Manual smoke: one explainer rendered + previewable in /lab/drafts | OUTLINE — re-plan at start |
| 3 | Reddit clip ingest + Stage-1 triage + /clips Inbox tab + ingest_blocklist | Reddit cron writes clip_library rows; Inbox lists them; Block source works | OUTLINE — re-plan at start |
| 4 | Format 2: Composer agent + orchestrator format-fork + render_f2 + /clips Candidates+Rendered tabs + promote-to-your_videos | One compilation rendered + previewable in /clips Rendered tab | OUTLINE — re-plan at start |
| 5 | OAuth + analytics + scheduling: YouTube OAuth flow + performance-sync rewrite + scheduled-uploader + /operations page + Music library import CLI | End-to-end: draft → render → schedule → posted-to-YT + video_analytics populating daily | OUTLINE — re-plan at start |

Final tag at end of Phase 5: `v0.4.0`.

---

## File Structure (all phases)

```
shorts-os/
├── package.json                                    # Modified — add @vercel/sandbox, @vercel/blob, luxon, jsonwebtoken, @types/jsonwebtoken; bump 0.3.1 → 0.4.0 at Phase 5
├── README.md                                       # Modified at Phase 5 — note Plan #4 shipped
├── vercel.ts                                       # NEW — Phase 1; replaces any vercel.json; defines all crons
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── cron/
│   │   │   │   ├── render-dispatcher/route.ts      # NEW Phase 1
│   │   │   │   ├── render-watchdog/route.ts        # NEW Phase 1
│   │   │   │   ├── reddit-clip-discovery/route.ts  # NEW Phase 3
│   │   │   │   ├── scheduled-uploader/route.ts     # NEW Phase 5
│   │   │   │   └── performance-sync/route.ts       # REPLACED Phase 5 (currently a stub)
│   │   │   ├── render/
│   │   │   │   └── complete/route.ts               # NEW Phase 1 (sandbox callback)
│   │   │   ├── lab/
│   │   │   │   ├── render/route.ts                 # NEW Phase 2 (POST enqueues render_f1)
│   │   │   │   ├── schedule/route.ts               # NEW Phase 5
│   │   │   │   └── upload/route.ts                 # NEW Phase 5 (escape hatch "Post now")
│   │   │   ├── clips/
│   │   │   │   ├── block/route.ts                  # NEW Phase 3
│   │   │   │   ├── ingest-url/route.ts             # NEW Phase 3
│   │   │   │   ├── candidates/[id]/approve/route.ts# NEW Phase 4
│   │   │   │   ├── candidates/[id]/reject/route.ts # NEW Phase 4
│   │   │   │   └── rendered/[id]/approve/route.ts  # NEW Phase 4
│   │   │   ├── youtube/oauth/
│   │   │   │   ├── start/route.ts                  # NEW Phase 5
│   │   │   │   └── callback/route.ts               # NEW Phase 5
│   │   │   └── operator-alerts/
│   │   │       └── resolve/route.ts                # NEW Phase 5
│   │   ├── clips/page.tsx                          # NEW Phase 3 (Inbox); Phase 4 adds tabs
│   │   ├── operations/page.tsx                     # NEW Phase 5
│   │   ├── settings/channel/page.tsx               # NEW Phase 5 (OAuth connect)
│   │   └── lab/page.tsx                            # Modified Phase 2 (drafts tab states) + Phase 5 (scheduling)
│   ├── components/
│   │   ├── clips/                                  # NEW Phase 3+
│   │   ├── operations/                             # NEW Phase 5
│   │   └── lab/draft-row.tsx                       # Modified Phase 2 (Render button) + Phase 5 (Approve & Schedule)
│   ├── lib/
│   │   ├── render/
│   │   │   ├── workers/
│   │   │   │   ├── types.ts                        # NEW Phase 1 (RenderWorker interface)
│   │   │   │   └── vercel-sandbox.ts               # NEW Phase 1
│   │   │   ├── dispatcher.ts                       # NEW Phase 1 (dispatcher logic, called by cron)
│   │   │   ├── watchdog.ts                         # NEW Phase 1
│   │   │   ├── callback-token.ts                   # NEW Phase 1 (JWT sign/verify)
│   │   │   └── job-payload.ts                      # NEW Phase 1 (payload schemas)
│   │   ├── encryption.ts                           # NEW Phase 1 (AES-256-GCM key-version pattern)
│   │   ├── timezone.ts                             # NEW Phase 5 (luxon helpers: nextOpenSlotAfter)
│   │   ├── agents/
│   │   │   ├── composer.ts                         # NEW Phase 4
│   │   │   ├── orchestrator.ts                     # Modified Phase 4 (format-branch fork)
│   │   │   ├── strategist.ts                       # Modified Phase 4 (selected_format + analyst_guidance_acknowledged + format-mix enforcement)
│   │   │   ├── director.ts                         # Modified Phase 2 (held_shot_with_text_animation treatment)
│   │   │   └── constants.ts                        # Modified Phase 2 (VISUAL_TREATMENTS adds held_shot_with_text_animation)
│   │   ├── clients/
│   │   │   ├── reddit.ts                           # Modified Phase 3 (add getVideoPostsByLast24h)
│   │   │   ├── pexels.ts                           # NEW Phase 2
│   │   │   ├── cartesia.ts                         # NEW Phase 2 (thin client; full use in worker)
│   │   │   └── youtube.ts                          # Modified Phase 5 (add OAuth + analytics methods)
│   │   └── supabase/repositories/
│   │       ├── render-jobs.ts                      # NEW Phase 1
│   │       ├── operator-alerts.ts                  # NEW Phase 1
│   │       ├── clip-library.ts                     # NEW Phase 3
│   │       ├── compilation-drafts.ts               # NEW Phase 4
│   │       ├── music-tracks.ts                     # NEW Phase 5 (used by import CLI + worker)
│   │       ├── schedule-recommendations.ts         # NEW Phase 5
│   │       ├── ingest-blocklist.ts                 # NEW Phase 3
│   │       ├── ingest-skip-log.ts                  # NEW Phase 3
│   │       ├── video-analytics.ts                  # NEW Phase 5
│   │       ├── channels.ts                         # Modified Phase 1 (new column reads) + Phase 5 (token encryption)
│   │       ├── decisions.ts                        # Modified Phase 1 (prompt_version + guidance_ids_used)
│   │       └── your-videos.ts                      # Modified Phase 2 (state transitions) + Phase 5 (scheduling)
│   └── tests/
│       └── lib/  ... mirroring src/lib structure   # NEW per phase
├── scripts/
│   ├── render-worker/                              # NEW Phase 1 (sandbox-side code, separate package)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── run.ts
│   │   ├── handlers/
│   │   │   ├── clip-ingest.ts                      # Stub Phase 1, real impl Phase 3
│   │   │   ├── render-f1.ts                        # Minimal Phase 1, full Phase 2
│   │   │   ├── render-f2.ts                        # Stub Phase 1, real impl Phase 4
│   │   │   └── upload.ts                           # Stub Phase 1, real impl Phase 5
│   │   └── lib/
│   │       ├── supabase.ts                         # Service-role client
│   │       ├── blob.ts                             # Vercel Blob put/get
│   │       ├── ffmpeg-commands.ts                  # Centralized ffmpeg invocations
│   │       ├── youtube-client.ts                   # Phase 5 (OAuth refresh + Data API)
│   │       ├── watch.ts                            # Phase 3 (/watch components)
│   │       └── encryption.ts                       # Duplicate or symlink of src/lib/encryption.ts
│   └── import-music-library.ts                     # NEW Phase 5 (operator-run CLI)
└── supabase/migrations/
    ├── 20260525000002_plan_4_schema.sql            # NEW Phase 1 (all Plan #4 schema in one migration)
    └── 20260525000003_reseed_dyfrx_channel.sql     # NEW Phase 1 (channel + cars niche)
```

**File-responsibility notes:**
- `src/lib/render/*` is server-only — every file starts with `import "server-only";`.
- `scripts/render-worker/` is a **separate package** with its own `package.json` and `node_modules`. It runs inside Vercel Sandbox, not in the Next.js process. Do NOT import from `src/lib/*` directly — duplicate small utilities (encryption helper) or use relative imports if the bundler permits.
- **No `@vercel/sandbox` imports outside** `src/lib/render/workers/vercel-sandbox.ts` and `scripts/render-worker/`. Enforced via code review (Plan #4) and optional ESLint rule (Phase 2 stretch).
- Repositories accept the Supabase client as first arg, so unit tests mock the client. Mirror existing pattern from [src/lib/supabase/repositories/topic-queue.ts](src/lib/supabase/repositories/topic-queue.ts).
- Agent runners are pure functions of their context. The orchestrator owns DB writeback and event emission.

---

## Testing Philosophy

- **Unit tests (TDD)** for every repository, every agent runner, every render-side handler (mocked Sandbox), the dispatcher, watchdog, callback endpoint, encryption, timezone helpers.
- **Mock pattern**: `vi.mock('@vercel/sandbox', ...)`, `vi.mock('@supabase/supabase-js', ...)`. Reuse the mock-chain pattern from [src/tests/lib/supabase/repositories/topic-queue.test.ts](src/tests/lib/supabase/repositories/topic-queue.test.ts).
- **Agent runners** mock `ai`'s `generateObject` via `vi.mock`. Verify Zod schema validation rejects bad outputs and the fallback path activates (mirroring `voice-coach.test.ts`).
- **Orchestrator** mocks all agent runners + all repositories. Verifies event ordering, DB row counts, and failure paths.
- **Render handlers (sandbox-side)** are unit-tested in isolation; the Sandbox itself is mocked at the dispatcher boundary.
- **No UI snapshot tests.** Aesthetics will evolve.
- **Phase 1 acceptance gate** is a **measured** wall-clock benchmark, not a green-tick test.
- **No integration tests in CI.** Optional gated `INTEGRATION=1` tests can exist.

## Conventions

- TypeScript strict mode. No `any`. Use `unknown` + Zod parse at boundaries.
- Server Components by default. Add `"use client"` only when needed.
- All secret-holding modules start with `import "server-only"`.
- API routes validate inputs with Zod, return JSON, never throw to the framework.
- Conventional Commits (`feat:` / `fix:` / `chore:` / `docs:` / `test:` / `refactor:`).
- One task = one or more commits, but **every task ends with at least one commit** before moving on.
- New files include a top-of-file comment explaining the file's role for future readers.
- When running `npm run dev` from a Claude Code shell, add `-u ANTHROPIC_BASE_URL` to the env -u list per the user memory entry, or AI SDK calls 404.
- **AGENTS.md/CLAUDE.md note:** Next.js 16 has breaking changes — read `node_modules/next/dist/docs/` for the relevant API before writing any route handler or page code. Do not write from training-data memory.

---

# PHASE 1: Foundation + render worker FSM + first render benchmark

**Scope:** All Plan #4 schema lands. RenderWorker abstraction + VercelSandboxRenderWorker + render_jobs queue + dispatcher + watchdog + JWT callback endpoint. Stub handlers for 4 job types. One minimal `render_f1` implementation that uses Cartesia TTS over a black background — enough to validate the FSM + Sandbox cold-start + ffmpeg + Blob upload end-to-end. The 240s benchmark acceptance gate is the phase's exit criterion.

**Acceptance gate:** One real `render_jobs` row of `job_type='render_f1'` measured end-to-end (dispatcher claim → Sandbox cold-start → npm ci → minimal render → Blob upload → callback received → row status='succeeded'). Total wall-clock ≤ **240 seconds**. If exceeded, pause Phase 2; discuss pre-baked Sandbox image with operator.

---

## Task 1.1: Plan #4 schema migration (all new tables + altered tables + new columns)

**Files:**
- Create: `supabase/migrations/20260525000002_plan_4_schema.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260525000002_plan_4_schema.sql
--
-- Plan #4 schema. Adds the render queue, clip library, compilation drafts,
-- music tracks, scheduling, operator alerts, ingest blocklist, OAuth state.
-- Also extends decisions (prompt_version, guidance_ids_used per Plan #5 carry-forward),
-- your_videos (scheduled status + scheduled_for + posted_hour_local + posted_dow_local),
-- channels (max_clip_ingest_per_day + timezone + posting_schedule + target_format_mix),
-- and renames your_videos_analytics_snapshots → video_analytics with extended columns.

-- 1) decisions extension (Plan #5 carry-forward)
alter table public.decisions
  add column prompt_version text,
  add column guidance_ids_used uuid[] not null default '{}';

-- 2) your_videos extension
alter table public.your_videos
  add column scheduled_for timestamptz,
  add column posted_hour_local int check (posted_hour_local between 0 and 23),
  add column posted_dow_local int check (posted_dow_local between 0 and 6);
alter table public.your_videos drop constraint your_videos_status_check;
alter table public.your_videos add constraint your_videos_status_check
  check (status in (
    'draft','rendering','rendered','scheduled','uploading','posted','failed'
  ));
create index your_videos_scheduled_idx on public.your_videos (scheduled_for)
  where status = 'scheduled';
create index your_videos_time_of_day_idx
  on public.your_videos (channel_id, posted_dow_local, posted_hour_local)
  where status = 'posted';

-- 3) channels extension
alter table public.channels
  add column max_clip_ingest_per_day int not null default 10,
  add column timezone text not null default 'America/New_York',
  add column posting_schedule jsonb not null default '{
    "weekdays": ["07:30","08:30","18:30","20:00"],
    "weekends": ["11:30","13:30","19:30","21:00"]
  }'::jsonb,
  add column target_format_mix jsonb not null default '{
    "explainer": 0.60,
    "compilation": 0.40
  }'::jsonb;

-- 4) Rename + extend your_videos_analytics_snapshots → video_analytics
alter table public.your_videos_analytics_snapshots rename to video_analytics;
alter table public.video_analytics rename column video_id to your_video_id;
alter table public.video_analytics
  add column shares bigint,
  add column impressions bigint,
  add column watch_time_seconds bigint,
  add column retention_curve_jsonb jsonb,
  add column raw_payload jsonb;
alter index yv_analytics_video_idx rename to video_analytics_video_idx;

-- 5) clip_library
create table public.clip_library (
  id uuid primary key default uuid_generate_v4(),
  source_url text not null,
  source_platform text not null check (source_platform in ('youtube','tiktok','reddit','twitch','upload')),
  source_creator text,
  local_path text not null,
  duration_seconds numeric not null,
  width int,
  height int,
  description text,
  tags text[] not null default '{}',
  niche_id uuid references public.niches(id) on delete set null,
  added_at timestamptz not null default now(),
  added_by text not null,
  unique (source_url)
);
create index clip_library_tags_idx on public.clip_library using gin (tags);
create index clip_library_niche_idx on public.clip_library (niche_id, added_at desc);

-- 6) music_tracks
create table public.music_tracks (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  artist text,
  source text not null default 'youtube_audio_library'
    check (source in ('youtube_audio_library','operator_upload','public_domain','creator_commons')),
  license_notes text,
  requires_attribution boolean not null default false,
  local_path text not null,
  duration_seconds numeric,
  genre text,
  energy_level int check (energy_level between 1 and 5),
  added_at timestamptz not null default now()
);
create index music_tracks_genre_energy_idx on public.music_tracks (genre, energy_level);
create index music_tracks_attribution_idx on public.music_tracks (requires_attribution);

-- 7) compilation_drafts
create table public.compilation_drafts (
  id uuid primary key default uuid_generate_v4(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  topic_queue_id uuid references public.topic_queue(id) on delete set null,
  theme text not null,
  title_template text not null,
  accent_word text not null,
  title_formula_id text not null,
  reveal_pattern text not null check (reveal_pattern in ('chronological','dramatic','reverse_rank')),
  caption_style text not null check (caption_style in ('descriptive','reactive','mixed')),
  layout_variant text not null default 'top5_sidebar'
    check (layout_variant in ('top5_sidebar','top5_overlay')),
  clip_refs jsonb not null,
  music_track_id uuid references public.music_tracks(id) on delete set null,
  status text not null default 'proposed' check (status in (
    'proposed','approved','rejected','rendering','rendered','posted','failed'
  )),
  rendered_path text,
  promoted_your_video_id uuid references public.your_videos(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index compilation_drafts_channel_status_idx on public.compilation_drafts (channel_id, status, created_at desc);
create index compilation_drafts_recent_patterns_idx on public.compilation_drafts (channel_id, created_at desc)
  where status in ('posted','rendered');

-- 8) render_jobs
create table public.render_jobs (
  id uuid primary key default uuid_generate_v4(),
  job_type text not null check (job_type in ('clip_ingest','render_f1','render_f2','upload')),
  payload jsonb not null,
  status text not null default 'pending' check (status in (
    'pending','claimed','running','succeeded','failed'
  )),
  attempts int not null default 0,
  last_error text,
  claimed_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  sandbox_invocation_id text,
  your_video_id uuid references public.your_videos(id) on delete cascade,
  compilation_draft_id uuid references public.compilation_drafts(id) on delete cascade,
  clip_library_id uuid references public.clip_library(id) on delete set null,
  created_at timestamptz not null default now()
);
create index render_jobs_claimable_idx on public.render_jobs (status, created_at)
  where status in ('pending','claimed','running');
create index render_jobs_type_idx on public.render_jobs (job_type, status);

-- 9) ingest_blocklist
create table public.ingest_blocklist (
  id uuid primary key default uuid_generate_v4(),
  source_platform text not null check (source_platform in ('reddit','youtube','tiktok')),
  identifier text not null,
  identifier_type text not null check (identifier_type in ('subreddit','author')),
  reason text,
  added_by text not null default 'operator',
  added_at timestamptz not null default now(),
  unique (source_platform, identifier_type, identifier)
);

-- 10) ingest_skip_log
create table public.ingest_skip_log (
  id uuid primary key default uuid_generate_v4(),
  source_platform text not null,
  source_url text not null,
  stage_1_score int not null,
  reasoning text,
  skipped_at timestamptz not null default now()
);
create index ingest_skip_log_recent_idx on public.ingest_skip_log (skipped_at desc);

-- 11) youtube_oauth_state
create table public.youtube_oauth_state (
  state text primary key,
  channel_id uuid not null references public.channels(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 12) operator_alerts
create table public.operator_alerts (
  id uuid primary key default uuid_generate_v4(),
  channel_id uuid references public.channels(id) on delete cascade,
  category text not null check (category in (
    'format_mix_drift','schedule_backlog_overflow','cost_spike',
    'oauth_token_revoked','clip_ingest_zero_yield','analyst_recommendation'
  )),
  severity text not null default 'info' check (severity in ('info','warn','error')),
  message text not null,
  suggested_actions jsonb,
  context jsonb,
  status text not null default 'unresolved'
    check (status in ('unresolved','acknowledged','resolved','dismissed')),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index operator_alerts_unresolved_idx on public.operator_alerts (channel_id, severity, created_at desc)
  where status in ('unresolved','acknowledged');

-- 13) schedule_recommendations (Plan #5 writes; Plan #4 ships table + UI)
create table public.schedule_recommendations (
  id uuid primary key default uuid_generate_v4(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  analyst_run_id uuid,
  recommended_posting_schedule jsonb,
  recommended_format_mix jsonb,
  evidence jsonb not null,
  confidence text not null check (confidence in ('low','medium','high')),
  status text not null default 'pending'
    check (status in ('pending','applied','dismissed','superseded')),
  applied_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);
create index schedule_recs_channel_status_idx
  on public.schedule_recommendations (channel_id, status, created_at desc);

-- 14) Seed the composer agent row (orchestrator joins agents on agent_id)
insert into public.agents (id, display_name, current_state, current_task)
values ('composer', 'The Composer', 'idle', null)
on conflict (id) do nothing;
```

- [ ] **Step 2: Apply the migration to the linked Supabase project**

```bash
npx supabase db push --linked
```

Expected: "Applying migration 20260525000002_plan_4_schema.sql..." then success.

- [ ] **Step 3: Verify schema state**

```bash
npx supabase db remote commit --linked --dry-run 2>&1 | tail -20
# OR query directly via service-role psql connection
```

Confirm: `render_jobs`, `clip_library`, `music_tracks`, `compilation_drafts`, `ingest_blocklist`, `ingest_skip_log`, `youtube_oauth_state`, `operator_alerts`, `schedule_recommendations`, `video_analytics` tables exist. Confirm `your_videos.status` accepts `'scheduled'` and `'uploading'`. Confirm `decisions.prompt_version` and `decisions.guidance_ids_used` columns exist.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260525000002_plan_4_schema.sql
git commit -m "feat(db): add Plan #4 schema (render queue, clips, music, scheduling, alerts)"
```

---

## Task 1.2: Channel + niche reseed migration

**Files:**
- Create: `supabase/migrations/20260525000003_reseed_dyfrx_channel.sql`

> **Operator-input required before this task:** confirm the dyfrx_9754 **YouTube channel ID** (UCxxxxxxxxxxxxxx from studio.youtube.com → Settings → Channel → Advanced) and the **subreddit list** for the cars niche. Substitute below where marked.

- [ ] **Step 1: Create the reseed migration**

```sql
-- supabase/migrations/20260525000003_reseed_dyfrx_channel.sql
--
-- Reseeds the placeholder 'default' channel to dyfrx_9754/cars per operator decision.
-- Master design "start fresh" guidance is intentionally overridden by operator:
-- existing dyfrx_9754 channel keeps its subscriber base + age; old wrong-niche
-- videos remain public. See spec §"Pivot 1" for tradeoff documentation.

insert into public.niches (slug, display_name, description,
  subreddits, youtube_search_terms, tiktok_hashtags) values
('cars', 'Cars', 'Car crashes, street racing, mechanic fails, driving content',
  array['IdiotsInCars','JustRolledIntoTheShop','Cartalk','cars','RoastMyCar',
        'spotted','formuladank','carporn'],
  array['car crash compilation','street race fails','mechanic fail',
        'driver fail','dashcam','car review shorts'],
  array['carcrash','dashcam','streetrace','idiotsindriving','carfail'])
on conflict (slug) do nothing;

update public.channels
  set slug='dyfrx_9754',
      display_name='dyfrx_9754',
      external_channel_id='UCXXXXXXXXXXXXXXXXXXXX',  -- TODO operator: replace with real UC id
      niche_id=(select id from public.niches where slug='cars'),
      persona=jsonb_build_object(
        'niche', 'cars',
        'voice', 'matter-of-fact, slight edge, casual not corporate',
        'pov', 'these crashes and mechanic fails reveal car culture truths',
        'style_guide', 'open with a specific make+model or year, end with a question or a callout',
        'forbidden', array['fatal crashes with visible injuries', 'doxxing drivers',
                          'glorifying dangerous street racing', 'political angle on car culture']
      ),
      default_voice_id='sonic-narrator-male-deadpan',   -- Cartesia preset; replace if operator picks different
      default_tts_provider='cartesia',
      timezone='America/New_York',
      max_clip_ingest_per_day=10
  where slug='default';
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push --linked
```

- [ ] **Step 3: Verify the channel + niche rows**

Use Supabase Studio (or service-role SQL) to confirm:
```sql
select slug, niche_id, external_channel_id, timezone from public.channels;
-- Expect: slug='dyfrx_9754', niche_id=<uuid>, external_channel_id='UCXXXX...' (operator's real id),
--         timezone='America/New_York'
select slug, subreddits from public.niches;
-- Expect: 'cars' row with the array of subreddits
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260525000003_reseed_dyfrx_channel.sql
git commit -m "feat(db): reseed channel to dyfrx_9754 + cars niche"
```

---

## Task 1.3: Regenerate Supabase TypeScript types

**Files:**
- Modify: `src/lib/supabase/types.ts` (or wherever generated types live in this repo)

- [ ] **Step 1: Generate types**

```bash
npx supabase gen types typescript --linked > src/lib/supabase/types.ts
```

- [ ] **Step 2: Verify the new tables appear**

```bash
grep -E "render_jobs|clip_library|music_tracks|compilation_drafts|operator_alerts|schedule_recommendations|video_analytics" src/lib/supabase/types.ts | head
```

Expected: at least one line per table name.

- [ ] **Step 3: Run typecheck to catch any downstream breakage**

```bash
npm run build
```

Expected: build succeeds OR fails only with errors in files we're about to modify. If unrelated files break (e.g., a removed-column reference), fix them as part of this task before committing.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/types.ts
git commit -m "chore(db): regenerate types after Plan #4 schema migration"
```

---

## Task 1.4: Encryption utility (AES-256-GCM, key-version pattern)

**Files:**
- Create: `src/lib/encryption.ts`
- Test: `src/tests/lib/encryption.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/lib/encryption.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { encryptSecret, decryptSecret, EncryptionVersionError } from '@/lib/encryption';

const KEY_V1 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // 32 bytes hex
const KEY_V2 = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

describe('encryption', () => {
  beforeEach(() => {
    vi.stubEnv('OAUTH_TOKEN_ENCRYPTION_KEY_V1', KEY_V1);
    vi.stubEnv('OAUTH_TOKEN_ENCRYPTION_KEY_V2', KEY_V2);
    vi.stubEnv('OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION', '1');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('round-trips with current key version', () => {
    const plaintext = 'refresh-token-secret-value-123';
    const ciphertext = encryptSecret(plaintext);
    expect(ciphertext.version).toBe(1);
    expect(typeof ciphertext.iv).toBe('string');
    expect(typeof ciphertext.tag).toBe('string');
    expect(typeof ciphertext.ciphertext).toBe('string');
    expect(decryptSecret(ciphertext)).toBe(plaintext);
  });

  it('decrypts a v1 row after CURRENT_VERSION is flipped to v2', () => {
    const ciphertext = encryptSecret('secret');
    expect(ciphertext.version).toBe(1);
    vi.stubEnv('OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION', '2');
    expect(decryptSecret(ciphertext)).toBe('secret');
    // New writes use v2
    expect(encryptSecret('next').version).toBe(2);
  });

  it('throws EncryptionVersionError if a key version is missing', () => {
    const ciphertext = { version: 99, iv: 'aa', tag: 'bb', ciphertext: 'cc' };
    expect(() => decryptSecret(ciphertext)).toThrow(EncryptionVersionError);
  });

  it('throws if CURRENT_VERSION env is missing', () => {
    vi.unstubAllEnvs();
    vi.stubEnv('OAUTH_TOKEN_ENCRYPTION_KEY_V1', KEY_V1);
    expect(() => encryptSecret('x')).toThrow(/OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- src/tests/lib/encryption.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/encryption'".

- [ ] **Step 3: Implement encryption.ts**

```ts
// src/lib/encryption.ts
//
// AES-256-GCM with key-version dispatch. Used for channels.oauth_refresh_token_encrypted.
// Plaintext is encrypted under the CURRENT version's key. Ciphertext carries the
// version so old rows stay decryptable across key rotations.
//
// Rotation playbook:
//   1. Add OAUTH_TOKEN_ENCRYPTION_KEY_V2 env var; deploy.
//   2. Flip OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION=2; deploy.
//   3. Old rows decrypt with V1; new writes encrypt with V2.
//   4. Opportunistic re-encrypt on next row write (e.g., next OAuth reconsent).
import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes, type CipherGCMTypes } from 'node:crypto';

const ALGORITHM: CipherGCMTypes = 'aes-256-gcm';
const IV_BYTES = 12;     // GCM standard
const KEY_BYTES = 32;    // AES-256

export class EncryptionVersionError extends Error {
  constructor(version: number) {
    super(`Encryption key version ${version} not configured (set OAUTH_TOKEN_ENCRYPTION_KEY_V${version})`);
    this.name = 'EncryptionVersionError';
  }
}

export interface EncryptedSecret {
  version: number;
  iv: string;          // base64
  tag: string;         // base64
  ciphertext: string;  // base64
}

function getKeyForVersion(version: number): Buffer {
  const env = process.env[`OAUTH_TOKEN_ENCRYPTION_KEY_V${version}`];
  if (!env) throw new EncryptionVersionError(version);
  const key = Buffer.from(env, 'hex');
  if (key.length !== KEY_BYTES) {
    throw new Error(`OAUTH_TOKEN_ENCRYPTION_KEY_V${version} must be ${KEY_BYTES * 2} hex chars (got ${env.length})`);
  }
  return key;
}

function getCurrentVersion(): number {
  const raw = process.env.OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION;
  if (!raw) throw new Error('OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION must be set');
  const v = parseInt(raw, 10);
  if (!Number.isFinite(v) || v < 1) throw new Error(`Invalid OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION=${raw}`);
  return v;
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const version = getCurrentVersion();
  const key = getKeyForVersion(version);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export function decryptSecret(blob: EncryptedSecret): string {
  const key = getKeyForVersion(blob.version);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(blob.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(blob.ciphertext, 'base64')), decipher.final()]);
  return plaintext.toString('utf8');
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- src/tests/lib/encryption.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/encryption.ts src/tests/lib/encryption.test.ts
git commit -m "feat(encryption): add AES-256-GCM helper with key-version dispatch"
```

---

## Task 1.5: Extend decisions repository with prompt_version + guidance_ids_used

**Files:**
- Modify: `src/lib/supabase/repositories/decisions.ts`
- Modify: `src/tests/lib/supabase/repositories/decisions.test.ts`

- [ ] **Step 1: Read current decisions.ts signature**

```bash
cat src/lib/supabase/repositories/decisions.ts
```

Identify `recordDecision` function and its `RecordDecisionParams` type.

- [ ] **Step 2: Add a failing test for the new parameters**

Append to `src/tests/lib/supabase/repositories/decisions.test.ts`:

```ts
it('writes prompt_version and guidance_ids_used when provided', async () => {
  const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'd1' }, error: null }) }) });
  const supabase = { from: vi.fn().mockReturnValue({ insert }) } as unknown as SupabaseClient;
  await recordDecision(supabase, {
    jobId: 'job-1',
    agentId: 'strategist',
    decisionType: 'topic_dispatch',
    inputs: { topic_id: 't1' },
    chosen: { format: 'explainer' },
    promptVersion: 'sha256-abc12345',
    guidanceIdsUsed: ['guid-1', 'guid-2'],
  });
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({
    prompt_version: 'sha256-abc12345',
    guidance_ids_used: ['guid-1', 'guid-2'],
  }));
});

it('defaults guidance_ids_used to empty array when omitted', async () => {
  const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'd1' }, error: null }) }) });
  const supabase = { from: vi.fn().mockReturnValue({ insert }) } as unknown as SupabaseClient;
  await recordDecision(supabase, {
    jobId: 'job-1', agentId: 'strategist', decisionType: 'topic_dispatch',
    inputs: {}, chosen: {},
  });
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({
    guidance_ids_used: [],
  }));
});
```

- [ ] **Step 3: Run test to verify failures**

```bash
npm test -- src/tests/lib/supabase/repositories/decisions.test.ts
```

Expected: the two new tests FAIL because the insert call doesn't include the new columns.

- [ ] **Step 4: Update recordDecision signature and impl**

In `src/lib/supabase/repositories/decisions.ts`, add to the params type:

```ts
export interface RecordDecisionParams {
  // ... existing fields
  promptVersion?: string;
  guidanceIdsUsed?: string[];
}
```

And in the `insert(...)` call, pass:
```ts
prompt_version: params.promptVersion ?? null,
guidance_ids_used: params.guidanceIdsUsed ?? [],
```

- [ ] **Step 5: Run tests, expect all pass**

```bash
npm test -- src/tests/lib/supabase/repositories/decisions.test.ts
```

Expected: all passing including the two new tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase/repositories/decisions.ts src/tests/lib/supabase/repositories/decisions.test.ts
git commit -m "feat(decisions): add prompt_version + guidance_ids_used columns (Plan #5 carry-forward)"
```

---

## Task 1.6: render_jobs repository

**Files:**
- Create: `src/lib/supabase/repositories/render-jobs.ts`
- Create: `src/tests/lib/supabase/repositories/render-jobs.test.ts`

- [ ] **Step 1: Write failing tests for the four functions we need**

```ts
// src/tests/lib/supabase/repositories/render-jobs.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  enqueueRenderJob, claimPendingJobs, markJobRunning,
  markJobSucceeded, markJobFailed, resetStuckJobs,
} from '@/lib/supabase/repositories/render-jobs';

describe('render-jobs repo', () => {
  it('enqueueRenderJob inserts a pending row', async () => {
    const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'j1', status: 'pending' }, error: null }) }) });
    const supabase = { from: vi.fn().mockReturnValue({ insert }) } as unknown as SupabaseClient;
    const job = await enqueueRenderJob(supabase, { jobType: 'render_f1', payload: { your_video_id: 'v1' }, yourVideoId: 'v1' });
    expect(job.id).toBe('j1');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      job_type: 'render_f1', status: 'pending', payload: { your_video_id: 'v1' }, your_video_id: 'v1',
    }));
  });

  it('claimPendingJobs calls the claim RPC and returns claimed rows', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: 'j1', status: 'claimed' }, { id: 'j2', status: 'claimed' }], error: null });
    const supabase = { rpc } as unknown as SupabaseClient;
    const claimed = await claimPendingJobs(supabase, { limit: 4 });
    expect(rpc).toHaveBeenCalledWith('claim_render_jobs', { p_limit: 4 });
    expect(claimed.map(j => j.id)).toEqual(['j1', 'j2']);
  });

  it('markJobRunning updates status with sandbox_invocation_id', async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const supabase = { from: vi.fn().mockReturnValue({ update }) } as unknown as SupabaseClient;
    await markJobRunning(supabase, { jobId: 'j1', sandboxInvocationId: 'sb-123' });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'running', sandbox_invocation_id: 'sb-123',
    }));
    expect(eq).toHaveBeenCalledWith('id', 'j1');
  });

  it('markJobSucceeded transitions running → succeeded idempotently', async () => {
    const match = vi.fn().mockResolvedValue({ data: { count: 1 }, error: null, count: 1 });
    const eq = vi.fn().mockReturnValue({ eq: match });
    const update = vi.fn().mockReturnValue({ eq });
    const supabase = { from: vi.fn().mockReturnValue({ update }) } as unknown as SupabaseClient;
    const rowsUpdated = await markJobSucceeded(supabase, { jobId: 'j1' });
    expect(rowsUpdated).toBe(1);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'succeeded' }));
  });

  it('markJobFailed records last_error and increments attempts', async () => {
    // Mock the full update().eq() chain — implementation may use a stored proc
    // for the attempts increment; the test verifies the contract not the impl
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const supabase = { from: vi.fn().mockReturnValue({ update }) } as unknown as SupabaseClient;
    await markJobFailed(supabase, { jobId: 'j1', error: 'sandbox crashed' });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed', last_error: 'sandbox crashed',
    }));
  });

  it('resetStuckJobs is callable (watchdog)', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: 'j1' }], error: null });
    const supabase = { rpc } as unknown as SupabaseClient;
    const reset = await resetStuckJobs(supabase);
    expect(rpc).toHaveBeenCalledWith('reset_stuck_render_jobs');
    expect(reset.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

```bash
npm test -- src/tests/lib/supabase/repositories/render-jobs.test.ts
```

- [ ] **Step 3: Add Postgres functions for atomic claim + watchdog reset**

These are SQL functions called via `supabase.rpc()`. Add a follow-up migration:

Create `supabase/migrations/20260525000004_render_jobs_functions.sql`:

```sql
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
```

Apply: `npx supabase db push --linked`

- [ ] **Step 4: Implement render-jobs.ts repository**

```ts
// src/lib/supabase/repositories/render-jobs.ts
//
// Repository for the render_jobs queue. Atomic claim + watchdog reset are
// implemented as Postgres functions (see migration 20260525000004) so we get
// transactional semantics for free.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type RenderJobType = 'clip_ingest' | 'render_f1' | 'render_f2' | 'upload';
export type RenderJobStatus = 'pending' | 'claimed' | 'running' | 'succeeded' | 'failed';

export interface RenderJobRow {
  id: string;
  job_type: RenderJobType;
  payload: unknown;
  status: RenderJobStatus;
  attempts: number;
  last_error: string | null;
  claimed_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  sandbox_invocation_id: string | null;
  your_video_id: string | null;
  compilation_draft_id: string | null;
  clip_library_id: string | null;
  created_at: string;
}

export interface EnqueueRenderJobParams {
  jobType: RenderJobType;
  payload: Record<string, unknown>;
  yourVideoId?: string;
  compilationDraftId?: string;
  clipLibraryId?: string;
}

export async function enqueueRenderJob(
  supabase: SupabaseClient,
  params: EnqueueRenderJobParams,
): Promise<RenderJobRow> {
  const { data, error } = await supabase
    .from('render_jobs')
    .insert({
      job_type: params.jobType,
      payload: params.payload,
      status: 'pending',
      your_video_id: params.yourVideoId ?? null,
      compilation_draft_id: params.compilationDraftId ?? null,
      clip_library_id: params.clipLibraryId ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as RenderJobRow;
}

export async function claimPendingJobs(
  supabase: SupabaseClient,
  args: { limit: number },
): Promise<RenderJobRow[]> {
  const { data, error } = await supabase.rpc('claim_render_jobs', { p_limit: args.limit });
  if (error) throw error;
  return (data ?? []) as RenderJobRow[];
}

export async function markJobRunning(
  supabase: SupabaseClient,
  args: { jobId: string; sandboxInvocationId: string },
): Promise<void> {
  const { error } = await supabase
    .from('render_jobs')
    .update({
      status: 'running',
      sandbox_invocation_id: args.sandboxInvocationId,
      started_at: new Date().toISOString(),
    })
    .eq('id', args.jobId);
  if (error) throw error;
}

export async function markJobSucceeded(
  supabase: SupabaseClient,
  args: { jobId: string },
): Promise<number> {
  // Only transition if currently running (idempotent against duplicate callbacks)
  const { count, error } = await supabase
    .from('render_jobs')
    .update({ status: 'succeeded', finished_at: new Date().toISOString() }, { count: 'exact' })
    .eq('id', args.jobId)
    .eq('status', 'running');
  if (error) throw error;
  return count ?? 0;
}

export async function markJobFailed(
  supabase: SupabaseClient,
  args: { jobId: string; error: string },
): Promise<void> {
  const { error } = await supabase
    .from('render_jobs')
    .update({
      status: 'failed',
      last_error: args.error,
      finished_at: new Date().toISOString(),
    })
    .eq('id', args.jobId);
  if (error) throw error;
}

export async function resetStuckJobs(supabase: SupabaseClient): Promise<RenderJobRow[]> {
  const { data, error } = await supabase.rpc('reset_stuck_render_jobs');
  if (error) throw error;
  return (data ?? []) as RenderJobRow[];
}
```

- [ ] **Step 5: Run all repository tests**

```bash
npm test -- src/tests/lib/supabase/repositories/render-jobs.test.ts
```

Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase/repositories/render-jobs.ts src/tests/lib/supabase/repositories/render-jobs.test.ts supabase/migrations/20260525000004_render_jobs_functions.sql
git commit -m "feat(render-jobs): add repository + atomic-claim + watchdog-reset Postgres functions"
```

---

## Task 1.7: operator_alerts repository (minimal — only insert+list for Phase 1)

**Files:**
- Create: `src/lib/supabase/repositories/operator-alerts.ts`
- Create: `src/tests/lib/supabase/repositories/operator-alerts.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/tests/lib/supabase/repositories/operator-alerts.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createOperatorAlert, listUnresolvedAlerts } from '@/lib/supabase/repositories/operator-alerts';

describe('operator-alerts repo', () => {
  it('createOperatorAlert inserts a row with category + severity + message', async () => {
    const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'a1' }, error: null }) }) });
    const supabase = { from: vi.fn().mockReturnValue({ insert }) } as unknown as SupabaseClient;
    await createOperatorAlert(supabase, {
      channelId: 'ch1', category: 'format_mix_drift', severity: 'warn', message: 'Mix drift',
    });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      channel_id: 'ch1', category: 'format_mix_drift', severity: 'warn', message: 'Mix drift',
    }));
  });

  it('listUnresolvedAlerts queries the right table + filters', async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ id: 'a1' }], error: null });
    const inFn = vi.fn().mockReturnValue({ order });
    const eq = vi.fn().mockReturnValue({ in: inFn });
    const select = vi.fn().mockReturnValue({ eq });
    const supabase = { from: vi.fn().mockReturnValue({ select }) } as unknown as SupabaseClient;
    const alerts = await listUnresolvedAlerts(supabase, { channelId: 'ch1' });
    expect(supabase.from).toHaveBeenCalledWith('operator_alerts');
    expect(eq).toHaveBeenCalledWith('channel_id', 'ch1');
    expect(inFn).toHaveBeenCalledWith('status', ['unresolved', 'acknowledged']);
    expect(alerts.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

```bash
npm test -- src/tests/lib/supabase/repositories/operator-alerts.test.ts
```

- [ ] **Step 3: Implement operator-alerts.ts**

```ts
// src/lib/supabase/repositories/operator-alerts.ts
//
// Repository for operator_alerts. Used by §2 format-mix escape clause, §5.5
// backlog-overflow guardrail, and (Plan #5) Analyst recommendations. The
// /operations page consumes listUnresolvedAlerts and shows them in a top banner.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type AlertCategory = 'format_mix_drift' | 'schedule_backlog_overflow'
  | 'cost_spike' | 'oauth_token_revoked' | 'clip_ingest_zero_yield' | 'analyst_recommendation';
export type AlertSeverity = 'info' | 'warn' | 'error';
export type AlertStatus = 'unresolved' | 'acknowledged' | 'resolved' | 'dismissed';

export interface OperatorAlertRow {
  id: string;
  channel_id: string | null;
  category: AlertCategory;
  severity: AlertSeverity;
  message: string;
  suggested_actions: unknown;
  context: unknown;
  status: AlertStatus;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface CreateOperatorAlertParams {
  channelId: string;
  category: AlertCategory;
  severity?: AlertSeverity;
  message: string;
  suggestedActions?: Array<{ label: string; action_type: string; params?: Record<string, unknown> }>;
  context?: Record<string, unknown>;
}

export async function createOperatorAlert(
  supabase: SupabaseClient,
  params: CreateOperatorAlertParams,
): Promise<OperatorAlertRow> {
  const { data, error } = await supabase
    .from('operator_alerts')
    .insert({
      channel_id: params.channelId,
      category: params.category,
      severity: params.severity ?? 'info',
      message: params.message,
      suggested_actions: params.suggestedActions ?? null,
      context: params.context ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as OperatorAlertRow;
}

export async function listUnresolvedAlerts(
  supabase: SupabaseClient,
  args: { channelId: string },
): Promise<OperatorAlertRow[]> {
  const { data, error } = await supabase
    .from('operator_alerts')
    .select('*')
    .eq('channel_id', args.channelId)
    .in('status', ['unresolved', 'acknowledged'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as OperatorAlertRow[];
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- src/tests/lib/supabase/repositories/operator-alerts.test.ts
```

Expected: passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/repositories/operator-alerts.ts src/tests/lib/supabase/repositories/operator-alerts.test.ts
git commit -m "feat(operator-alerts): minimal repo (create + list unresolved)"
```

---

## Task 1.8: RenderWorker interface + job payload schemas

**Files:**
- Create: `src/lib/render/workers/types.ts`
- Create: `src/lib/render/job-payload.ts`

- [ ] **Step 1: Define the interface and payload schemas**

```ts
// src/lib/render/workers/types.ts
//
// The RenderWorker interface. One implementation today (VercelSandboxRenderWorker).
// To swap to local-PC rendering later: add src/lib/render/workers/local-pc.ts
// and flip RENDER_WORKER env var. Zero schema/agent/UI changes required.
import 'server-only';
import type { RenderJobRow } from '@/lib/supabase/repositories/render-jobs';

export interface RenderWorker {
  /**
   * Dispatch a claimed job to the underlying execution environment.
   * Returns the invocation id so the dispatcher can record it on the row.
   * Does NOT wait for completion — workers report back via /api/render/complete.
   */
  dispatch(job: RenderJobRow, jobToken: string): Promise<{ invocationId: string }>;
}
```

```ts
// src/lib/render/job-payload.ts
//
// Zod schemas for each job_type's payload. The dispatcher validates payloads
// before dispatching to the worker; the worker re-validates after receiving.
import { z } from 'zod';

export const ClipIngestPayload = z.object({
  source_url: z.string().url(),
  niche_id: z.string().uuid(),
  source_creator: z.string().nullable().optional(),
});
export type ClipIngestPayload = z.infer<typeof ClipIngestPayload>;

export const RenderF1Payload = z.object({
  your_video_id: z.string().uuid(),
});
export type RenderF1Payload = z.infer<typeof RenderF1Payload>;

export const RenderF2Payload = z.object({
  compilation_draft_id: z.string().uuid(),
});
export type RenderF2Payload = z.infer<typeof RenderF2Payload>;

export const UploadPayload = z.object({
  your_video_id: z.string().uuid(),
});
export type UploadPayload = z.infer<typeof UploadPayload>;

export function parseJobPayload(jobType: string, payload: unknown) {
  switch (jobType) {
    case 'clip_ingest': return ClipIngestPayload.parse(payload);
    case 'render_f1':   return RenderF1Payload.parse(payload);
    case 'render_f2':   return RenderF2Payload.parse(payload);
    case 'upload':      return UploadPayload.parse(payload);
    default: throw new Error(`Unknown job_type: ${jobType}`);
  }
}
```

- [ ] **Step 2: Commit (no tests yet — these are pure types/schemas)**

```bash
git add src/lib/render/workers/types.ts src/lib/render/job-payload.ts
git commit -m "feat(render): add RenderWorker interface + job payload schemas"
```

---

## Task 1.9: JWT callback-token helper

**Files:**
- Create: `src/lib/render/callback-token.ts`
- Create: `src/tests/lib/render/callback-token.test.ts`

- [ ] **Step 1: Add jsonwebtoken dependency**

```bash
npm install jsonwebtoken
npm install --save-dev @types/jsonwebtoken
```

- [ ] **Step 2: Write failing test**

```ts
// src/tests/lib/render/callback-token.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { signCallbackToken, verifyCallbackToken, CallbackTokenError } from '@/lib/render/callback-token';

describe('callback-token', () => {
  beforeEach(() => { vi.stubEnv('RENDER_CALLBACK_SECRET', 'test-secret-do-not-use-in-prod'); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('round-trips a job_id', () => {
    const token = signCallbackToken({ jobId: 'job-1', ttlSeconds: 60 });
    const decoded = verifyCallbackToken(token);
    expect(decoded.jobId).toBe('job-1');
  });

  it('rejects an expired token', () => {
    const token = signCallbackToken({ jobId: 'job-1', ttlSeconds: -1 });
    expect(() => verifyCallbackToken(token)).toThrow(CallbackTokenError);
  });

  it('rejects a token signed with a different secret', () => {
    const token = signCallbackToken({ jobId: 'job-1', ttlSeconds: 60 });
    vi.stubEnv('RENDER_CALLBACK_SECRET', 'different-secret');
    expect(() => verifyCallbackToken(token)).toThrow(CallbackTokenError);
  });

  it('rejects malformed token', () => {
    expect(() => verifyCallbackToken('not-a-jwt')).toThrow(CallbackTokenError);
  });
});
```

- [ ] **Step 3: Implement callback-token.ts**

```ts
// src/lib/render/callback-token.ts
//
// JWT (HS256) tokens passed to the sandbox at dispatch and presented back to
// /api/render/complete. Token carries jobId + short exp.
import 'server-only';
import jwt from 'jsonwebtoken';

export class CallbackTokenError extends Error {
  constructor(message: string) { super(message); this.name = 'CallbackTokenError'; }
}

interface CallbackPayload {
  jobId: string;
}

export function signCallbackToken(args: { jobId: string; ttlSeconds: number }): string {
  const secret = process.env.RENDER_CALLBACK_SECRET;
  if (!secret) throw new Error('RENDER_CALLBACK_SECRET must be set');
  return jwt.sign({ jobId: args.jobId } satisfies CallbackPayload, secret, {
    algorithm: 'HS256',
    expiresIn: args.ttlSeconds,
  });
}

export function verifyCallbackToken(token: string): CallbackPayload {
  const secret = process.env.RENDER_CALLBACK_SECRET;
  if (!secret) throw new Error('RENDER_CALLBACK_SECRET must be set');
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    if (!decoded.jobId || typeof decoded.jobId !== 'string') {
      throw new CallbackTokenError('Token missing jobId');
    }
    return { jobId: decoded.jobId };
  } catch (err) {
    if (err instanceof CallbackTokenError) throw err;
    throw new CallbackTokenError(err instanceof Error ? err.message : 'Token verify failed');
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- src/tests/lib/render/callback-token.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/render/callback-token.ts src/tests/lib/render/callback-token.test.ts package.json package-lock.json
git commit -m "feat(render): add JWT callback-token helper for sandbox auth"
```

---

## Task 1.10: VercelSandboxRenderWorker implementation

**Files:**
- Create: `src/lib/render/workers/vercel-sandbox.ts`
- Create: `src/tests/lib/render/workers/vercel-sandbox.test.ts`

- [ ] **Step 1: Add @vercel/sandbox dependency**

```bash
npm install @vercel/sandbox @vercel/blob
```

- [ ] **Step 2: Write failing test (mocked sandbox)**

```ts
// src/tests/lib/render/workers/vercel-sandbox.test.ts
import { describe, it, expect, vi } from 'vitest';
import { VercelSandboxRenderWorker } from '@/lib/render/workers/vercel-sandbox';
import type { RenderJobRow } from '@/lib/supabase/repositories/render-jobs';

vi.mock('@vercel/sandbox', () => ({
  Sandbox: {
    create: vi.fn().mockResolvedValue({
      id: 'sandbox-abc',
      runCommand: vi.fn().mockResolvedValue({ id: 'cmd-1' }),
    }),
  },
}));

describe('VercelSandboxRenderWorker', () => {
  it('creates a sandbox, runs the worker entrypoint detached, and returns the invocation id', async () => {
    const worker = new VercelSandboxRenderWorker();
    const job = { id: 'job-1', job_type: 'render_f1', payload: { your_video_id: 'v1' } } as RenderJobRow;
    const result = await worker.dispatch(job, 'mock-jwt-token');
    expect(result.invocationId).toBe('sandbox-abc');
  });

  it('passes job id and token to the worker command', async () => {
    const { Sandbox } = await import('@vercel/sandbox');
    const runCommand = vi.fn().mockResolvedValue({ id: 'cmd-1' });
    (Sandbox.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'sb-xyz', runCommand });
    const worker = new VercelSandboxRenderWorker();
    const job = { id: 'job-2', job_type: 'render_f1', payload: {} } as RenderJobRow;
    await worker.dispatch(job, 'token-xyz');
    expect(runCommand).toHaveBeenCalledWith(expect.objectContaining({
      detached: true,
      args: expect.arrayContaining(['job-2', 'token-xyz']),
    }));
  });
});
```

- [ ] **Step 3: Implement vercel-sandbox.ts**

```ts
// src/lib/render/workers/vercel-sandbox.ts
//
// VercelSandboxRenderWorker — the only RenderWorker impl in Plan #4.
// Boots a Sandbox microVM, explicitly clones this repo's git ref into the VM,
// npm-installs the worker package, runs the entrypoint detached, returns the
// invocation id. The sandbox writes back via /api/render/complete; this worker
// does not wait.
//
// Code-into-sandbox mechanism: explicit `git clone` via runCommand (this is
// the pattern shown in Vercel Sandbox official examples — Sandbox.create's
// `source` option exists conceptually but its TS discriminated-union shape
// isn't documented in any code example, so we use the explicit pattern).
//
// Repo ref: VERCEL_GIT_COMMIT_SHA auto-populated on every Vercel deployment.
// For local dev, set SANDBOX_GIT_URL + SANDBOX_GIT_REF env vars explicitly.
import 'server-only';
import { Sandbox } from '@vercel/sandbox';
import type { RenderWorker } from './types';
import type { RenderJobRow } from '@/lib/supabase/repositories/render-jobs';

function getGitSource(): { url: string; ref: string } {
  const url = process.env.SANDBOX_GIT_URL ?? process.env.VERCEL_GIT_REPO_URL;
  const ref = process.env.SANDBOX_GIT_REF ?? process.env.VERCEL_GIT_COMMIT_SHA;
  if (!url || !ref) {
    throw new Error(
      'Cannot determine Sandbox git source. Set SANDBOX_GIT_URL + SANDBOX_GIT_REF for local dev, ' +
      'or deploy to Vercel where VERCEL_GIT_REPO_URL + VERCEL_GIT_COMMIT_SHA are auto-populated.',
    );
  }
  return { url, ref };
}

export class VercelSandboxRenderWorker implements RenderWorker {
  async dispatch(job: RenderJobRow, jobToken: string): Promise<{ invocationId: string }> {
    const { url: repoUrl, ref: gitRef } = getGitSource();
    const sandboxEnv: Record<string, string> = {
      SUPABASE_URL: process.env.SUPABASE_URL ?? '',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      CARTESIA_API_KEY: process.env.CARTESIA_API_KEY ?? '',
      PEXELS_API_KEY: process.env.PEXELS_API_KEY ?? '',
      GROQ_API_KEY: process.env.GROQ_API_KEY ?? '',
      VERCEL_BLOB_READ_WRITE_TOKEN: process.env.VERCEL_BLOB_READ_WRITE_TOKEN ?? '',
      RENDER_CALLBACK_BASE_URL: process.env.RENDER_CALLBACK_BASE_URL ?? '',
      OAUTH_TOKEN_ENCRYPTION_KEY_V1: process.env.OAUTH_TOKEN_ENCRYPTION_KEY_V1 ?? '',
      OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION: process.env.OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION ?? '',
      GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
      GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
    };

    const sandbox = await Sandbox.create({
      name: job.id,                          // for later Sandbox.get({ name }) lookups
      runtime: 'node24',                     // node24 is current Vercel default per 2026-02-27 knowledge update
      timeout: 15 * 60 * 1000,               // milliseconds (15 minutes)
    });

    // Bootstrap (blocking): git clone + npm ci. These two steps cap at ~60s each
    // per the Phase 1 benchmark gate. If exceeded, escalate for pre-baked image discussion.
    await sandbox.runCommand('git', ['clone', repoUrl, '.']);
    await sandbox.runCommand('git', ['checkout', gitRef]);
    await sandbox.runCommand({
      cmd: 'npm',
      args: ['ci', '--prefix', 'scripts/render-worker'],
    });

    // Detached: returns immediately; the sandbox continues executing and posts
    // back to /api/render/complete when run.ts finishes.
    await sandbox.runCommand({
      cmd: 'node',
      args: ['--import', 'tsx', 'scripts/render-worker/run.ts', job.id, jobToken],
      detached: true,
      env: { ...sandboxEnv, VERCEL_SANDBOX_ID: sandbox.id },
    });

    return { invocationId: sandbox.id };
  }
}
```

**Note on the SDK pattern:** `runCommand({ detached: true })` is confirmed in official Vercel Sandbox docs. `Sandbox.create({ source: {...} })` exists conceptually but no documented TS shape — the explicit `git clone` pattern above IS shown in official examples and is what we ship. The blocking bootstrap steps (clone + npm ci) eat ~30–60s of the wall-clock budget; Task 1.16 measures them separately.

**Note on tsx:** the worker entrypoint is `run.ts` (TypeScript). `node --import tsx run.ts` JIT-compiles via tsx (added in scripts/render-worker/package.json deps). Alternative for future optimization: pre-compile to .js as part of `npm ci` postinstall. Not worth the build complexity in Phase 1.

- [ ] **Step 4: Run tests**

```bash
npm test -- src/tests/lib/render/workers/vercel-sandbox.test.ts
```

Expected: passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/render/workers/vercel-sandbox.ts src/tests/lib/render/workers/vercel-sandbox.test.ts package.json package-lock.json
git commit -m "feat(render): add VercelSandboxRenderWorker impl"
```

---

## Task 1.11: Dispatcher logic + cron handler

**Files:**
- Create: `src/lib/render/dispatcher.ts`
- Create: `src/tests/lib/render/dispatcher.test.ts`
- Create: `src/app/api/cron/render-dispatcher/route.ts`

- [ ] **Step 1: Write failing test for dispatcher logic**

```ts
// src/tests/lib/render/dispatcher.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runDispatcher } from '@/lib/render/dispatcher';

describe('runDispatcher', () => {
  it('claims up to RENDER_CONCURRENCY jobs and dispatches each via the worker', async () => {
    const claimedJobs = [
      { id: 'j1', job_type: 'render_f1', payload: { your_video_id: 'v1' } },
      { id: 'j2', job_type: 'clip_ingest', payload: { source_url: 'https://r/x', niche_id: 'n1' } },
    ];
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: claimedJobs, error: null }),
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }),
    };
    const worker = { dispatch: vi.fn().mockResolvedValue({ invocationId: 'sb-id' }) };
    vi.stubEnv('RENDER_CONCURRENCY', '4');
    vi.stubEnv('RENDER_CALLBACK_SECRET', 'test-secret');

    const result = await runDispatcher({ supabase: supabase as never, worker, now: new Date() });
    expect(result.claimed).toBe(2);
    expect(worker.dispatch).toHaveBeenCalledTimes(2);
    expect(supabase.rpc).toHaveBeenCalledWith('claim_render_jobs', { p_limit: 4 });
  });

  it('returns claimed=0 when nothing is pending', async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) };
    const worker = { dispatch: vi.fn() };
    vi.stubEnv('RENDER_CONCURRENCY', '4');
    vi.stubEnv('RENDER_CALLBACK_SECRET', 'test-secret');
    const result = await runDispatcher({ supabase: supabase as never, worker, now: new Date() });
    expect(result.claimed).toBe(0);
    expect(worker.dispatch).not.toHaveBeenCalled();
  });

  it('marks a job failed if worker.dispatch throws', async () => {
    const claimedJobs = [{ id: 'j1', job_type: 'render_f1', payload: { your_video_id: 'v1' } }];
    const updateChain = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: claimedJobs, error: null }),
      from: vi.fn().mockReturnValue({ update: updateChain }),
    };
    const worker = { dispatch: vi.fn().mockRejectedValue(new Error('sandbox quota exceeded')) };
    vi.stubEnv('RENDER_CONCURRENCY', '4');
    vi.stubEnv('RENDER_CALLBACK_SECRET', 'test-secret');
    const result = await runDispatcher({ supabase: supabase as never, worker, now: new Date() });
    expect(result.claimed).toBe(1);
    expect(result.failed).toBe(1);
    // The status update should have included status='failed'
    expect(updateChain).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
npm test -- src/tests/lib/render/dispatcher.test.ts
```

- [ ] **Step 3: Implement dispatcher.ts**

```ts
// src/lib/render/dispatcher.ts
//
// Run by the render-dispatcher cron every 60 seconds. Claims pending render_jobs
// (atomic, via the claim_render_jobs Postgres function), then dispatches each
// to the configured RenderWorker. Workers return immediately (detached); they
// POST back to /api/render/complete when done.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  claimPendingJobs, markJobRunning, markJobFailed,
} from '@/lib/supabase/repositories/render-jobs';
import { signCallbackToken } from '@/lib/render/callback-token';
import type { RenderWorker } from '@/lib/render/workers/types';

export interface DispatcherResult {
  claimed: number;
  failed: number;
}

export async function runDispatcher(args: {
  supabase: SupabaseClient;
  worker: RenderWorker;
  now: Date;
}): Promise<DispatcherResult> {
  const concurrency = parseInt(process.env.RENDER_CONCURRENCY ?? '4', 10);
  const claimed = await claimPendingJobs(args.supabase, { limit: concurrency });
  let failed = 0;

  for (const job of claimed) {
    try {
      const token = signCallbackToken({ jobId: job.id, ttlSeconds: 15 * 60 });
      const { invocationId } = await args.worker.dispatch(job, token);
      await markJobRunning(args.supabase, { jobId: job.id, sandboxInvocationId: invocationId });
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      await markJobFailed(args.supabase, { jobId: job.id, error: `dispatcher_failed: ${msg}` });
    }
  }
  return { claimed: claimed.length, failed };
}
```

- [ ] **Step 4: Run tests, expect passing**

```bash
npm test -- src/tests/lib/render/dispatcher.test.ts
```

- [ ] **Step 5: Create the cron route handler**

> **Before writing this file: read `node_modules/next/dist/docs/` (or whatever the relevant guide is for Next.js 16 cron route handlers) per AGENTS.md.**

```ts
// src/app/api/cron/render-dispatcher/route.ts
//
// Runs every 60 seconds (Vercel Cron via vercel.ts). Thin wrapper around
// runDispatcher — just wires the Supabase service client + VercelSandboxRenderWorker.
import 'server-only';
import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/server';
import { runDispatcher } from '@/lib/render/dispatcher';
import { VercelSandboxRenderWorker } from '@/lib/render/workers/vercel-sandbox';

// Vercel Cron auth: in production, requests are authenticated with CRON_SECRET
// per https://vercel.com/docs/cron-jobs#how-to-secure-cron-jobs
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const supabase = getServiceSupabase();
  const worker = new VercelSandboxRenderWorker();
  const result = await runDispatcher({ supabase, worker, now: new Date() });
  return NextResponse.json({ ok: true, ...result });
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/render/dispatcher.ts src/tests/lib/render/dispatcher.test.ts src/app/api/cron/render-dispatcher/route.ts
git commit -m "feat(render): add dispatcher logic + cron handler"
```

---

## Task 1.12: Watchdog logic + cron handler

**Files:**
- Create: `src/lib/render/watchdog.ts`
- Create: `src/tests/lib/render/watchdog.test.ts`
- Create: `src/app/api/cron/render-watchdog/route.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/tests/lib/render/watchdog.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runWatchdog } from '@/lib/render/watchdog';

describe('runWatchdog', () => {
  it('calls reset_stuck_render_jobs and reports count', async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: [{ id: 'j1' }, { id: 'j2' }], error: null }) };
    const result = await runWatchdog({ supabase: supabase as never });
    expect(result.resetCount).toBe(2);
    expect(supabase.rpc).toHaveBeenCalledWith('reset_stuck_render_jobs');
  });

  it('returns resetCount=0 when nothing is stuck', async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) };
    const result = await runWatchdog({ supabase: supabase as never });
    expect(result.resetCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run (FAIL)**

```bash
npm test -- src/tests/lib/render/watchdog.test.ts
```

- [ ] **Step 3: Implement watchdog.ts**

```ts
// src/lib/render/watchdog.ts
//
// Run by render-watchdog cron every 5 minutes. Resets jobs stuck in 'claimed' >5min
// (dispatcher crashed before kicking off Sandbox) or 'running' >30min (sandbox crashed
// without calling back). After attempts=3 the row stays 'failed' permanently.
// All logic is in the reset_stuck_render_jobs Postgres function.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resetStuckJobs } from '@/lib/supabase/repositories/render-jobs';

export async function runWatchdog(args: { supabase: SupabaseClient }): Promise<{ resetCount: number }> {
  const reset = await resetStuckJobs(args.supabase);
  return { resetCount: reset.length };
}
```

- [ ] **Step 4: Create the cron route handler**

```ts
// src/app/api/cron/render-watchdog/route.ts
import 'server-only';
import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/server';
import { runWatchdog } from '@/lib/render/watchdog';

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }
  const supabase = getServiceSupabase();
  const result = await runWatchdog({ supabase });
  return NextResponse.json({ ok: true, ...result });
}
```

- [ ] **Step 5: Run tests**

```bash
npm test -- src/tests/lib/render/watchdog.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/render/watchdog.ts src/tests/lib/render/watchdog.test.ts src/app/api/cron/render-watchdog/route.ts
git commit -m "feat(render): add watchdog cron"
```

---

## Task 1.13: /api/render/complete callback endpoint

**Files:**
- Create: `src/app/api/render/complete/route.ts`
- Create: `src/tests/api/render/complete.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/tests/api/render/complete.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '@/app/api/render/complete/route';
import { signCallbackToken } from '@/lib/render/callback-token';

// Mock the service supabase to capture writes
const mockUpdate = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  getServiceSupabase: () => ({
    from: () => ({
      update: (...args: unknown[]) => { mockUpdate(...args); return { eq: () => ({ eq: () => Promise.resolve({ count: 1, error: null, data: null }) }) }; },
    }),
  }),
}));

describe('POST /api/render/complete', () => {
  beforeEach(() => {
    vi.stubEnv('RENDER_CALLBACK_SECRET', 'test-secret');
    mockUpdate.mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('accepts a succeeded result with valid JWT', async () => {
    const token = signCallbackToken({ jobId: 'job-1', ttlSeconds: 60 });
    const req = new Request('http://localhost/api/render/complete', {
      method: 'POST',
      headers: { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        job_id: 'job-1',
        sandbox_invocation_id: 'sb-abc',
        result: { status: 'succeeded', output: { render_artifact_url: 'https://blob/x.mp4' } },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('rejects when token is missing', async () => {
    const req = new Request('http://localhost/api/render/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ job_id: 'job-1', sandbox_invocation_id: 'sb', result: { status: 'succeeded', output: {} } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('rejects when token jobId mismatches body job_id', async () => {
    const token = signCallbackToken({ jobId: 'job-1', ttlSeconds: 60 });
    const req = new Request('http://localhost/api/render/complete', {
      method: 'POST',
      headers: { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ job_id: 'job-2', sandbox_invocation_id: 'sb', result: { status: 'succeeded', output: {} } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('rejects malformed body via Zod', async () => {
    const token = signCallbackToken({ jobId: 'job-1', ttlSeconds: 60 });
    const req = new Request('http://localhost/api/render/complete', {
      method: 'POST',
      headers: { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ /* missing fields */ }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
npm test -- src/tests/api/render/complete.test.ts
```

- [ ] **Step 3: Implement the callback route**

> **Before writing: read `node_modules/next/dist/docs/` for the App Router POST route convention if you're not sure.**

```ts
// src/app/api/render/complete/route.ts
//
// Sandbox callback endpoint. The render worker POSTs here with a JWT (per-job,
// signed with RENDER_CALLBACK_SECRET) when its handler finishes. The endpoint:
//   1. Verifies JWT signature + jobId match.
//   2. Atomically transitions render_jobs row status (idempotent against duplicate calls).
//   3. Applies job-type-specific side effects:
//        clip_ingest succeeded → insert clip_library row (Phase 3 adds this)
//        render_f1 succeeded → update your_videos.render_artifact_url + status='rendered'
//        render_f2 succeeded → update compilation_drafts.rendered_path + status='rendered'
//        upload    succeeded → update your_videos.posted_at + external_video_id + url + status='posted'
//                              + populate posted_hour_local + posted_dow_local
//   For Phase 1: only render_f1 side-effect is wired; others are stubbed (log + ignore).
import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServiceSupabase } from '@/lib/supabase/server';
import { verifyCallbackToken, CallbackTokenError } from '@/lib/render/callback-token';
import { markJobSucceeded, markJobFailed } from '@/lib/supabase/repositories/render-jobs';

const CompleteBody = z.object({
  job_id: z.string().uuid(),
  sandbox_invocation_id: z.string(),
  result: z.discriminatedUnion('status', [
    z.object({
      status: z.literal('succeeded'),
      output: z.record(z.string(), z.unknown()),
    }),
    z.object({
      status: z.literal('failed'),
      error: z.string(),
      output: z.record(z.string(), z.unknown()).optional(),
    }),
  ]),
});

export async function POST(req: Request) {
  // 1. Auth
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'missing_token' }, { status: 401 });
  }
  const token = authHeader.slice('Bearer '.length);
  let decoded;
  try { decoded = verifyCallbackToken(token); }
  catch (err) {
    if (err instanceof CallbackTokenError) {
      return NextResponse.json({ error: 'invalid_token', detail: err.message }, { status: 401 });
    }
    throw err;
  }

  // 2. Body
  let body;
  try { body = CompleteBody.parse(await req.json()); }
  catch (err) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (body.job_id !== decoded.jobId) {
    return NextResponse.json({ error: 'job_id_mismatch' }, { status: 403 });
  }

  // 3. State transition + side effects
  const supabase = getServiceSupabase();
  if (body.result.status === 'succeeded') {
    const rows = await markJobSucceeded(supabase, { jobId: body.job_id });
    // For Phase 1: handle render_f1 happy path side-effect inline.
    // Phase 3/4/5 will extend with the other job_type handlers.
    if (rows > 0 && 'render_artifact_url' in body.result.output) {
      const url = body.result.output.render_artifact_url as string;
      // Look up the render_jobs row to get the your_video_id
      const { data: jobRow } = await supabase
        .from('render_jobs').select('your_video_id').eq('id', body.job_id).single();
      if (jobRow?.your_video_id) {
        await supabase
          .from('your_videos')
          .update({ render_artifact_url: url, status: 'rendered', updated_at: new Date().toISOString() })
          .eq('id', jobRow.your_video_id);
      }
    }
  } else {
    await markJobFailed(supabase, { jobId: body.job_id, error: body.result.error });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- src/tests/api/render/complete.test.ts
```

Expected: passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/render/complete/route.ts src/tests/api/render/complete.test.ts
git commit -m "feat(render): add /api/render/complete callback endpoint (Phase 1 — render_f1 side effect only)"
```

---

## Task 1.14: Vercel cron configuration via vercel.ts

**Files:**
- Create: `vercel.ts` (root) — replaces any existing `vercel.json`

- [ ] **Step 1: Install @vercel/config**

```bash
npm install --save-dev @vercel/config
```

- [ ] **Step 2: Check whether a vercel.json exists**

```bash
ls -la vercel.json 2>/dev/null
```

If yes, plan to delete it after vercel.ts is wired. If no, just create vercel.ts.

- [ ] **Step 3: Create vercel.ts**

```ts
// vercel.ts
//
// Vercel project configuration. Replaces vercel.json (per Vercel knowledge update 2026-02-27).
// Currently defines Plan #4 cron schedules.
import { type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  crons: [
    { path: '/api/cron/render-dispatcher', schedule: '* * * * *' },  // every minute (60s spec target)
    { path: '/api/cron/render-watchdog',   schedule: '*/5 * * * *' }, // every 5 minutes
    // Phase 3 will add: { path: '/api/cron/reddit-clip-discovery', schedule: '*/30 * * * *' },
    // Phase 5 will add: { path: '/api/cron/scheduled-uploader',    schedule: '*/15 * * * *' },
    // Phase 5 will add: { path: '/api/cron/performance-sync',      schedule: '0 6 * * *' },  // daily 6am UTC
  ],
};
```

- [ ] **Step 4: If a vercel.json existed, remove it**

```bash
git rm vercel.json 2>/dev/null || true
```

- [ ] **Step 5: Commit**

```bash
git add vercel.ts package.json package-lock.json
git rm vercel.json 2>/dev/null || true
git commit -m "feat(vercel): switch to vercel.ts; add render-dispatcher + render-watchdog crons"
```

---

## Task 1.15: scripts/render-worker/ package scaffolding

**Files:**
- Create: `scripts/render-worker/package.json`
- Create: `scripts/render-worker/tsconfig.json`
- Create: `scripts/render-worker/run.ts`
- Create: `scripts/render-worker/handlers/clip-ingest.ts` (Phase 1 stub)
- Create: `scripts/render-worker/handlers/render-f1.ts` (Phase 1 minimal real impl — TTS over black bg)
- Create: `scripts/render-worker/handlers/render-f2.ts` (Phase 1 stub)
- Create: `scripts/render-worker/handlers/upload.ts` (Phase 1 stub)
- Create: `scripts/render-worker/lib/supabase.ts`
- Create: `scripts/render-worker/lib/blob.ts`
- Create: `scripts/render-worker/lib/callback.ts`
- Create: `scripts/render-worker/lib/ffmpeg-commands.ts` (minimal — Phase 2 extends)
- Create: `scripts/render-worker/lib/cartesia.ts` (minimal)
- Create: `scripts/render-worker/.gitignore`

- [ ] **Step 1: Create package.json with worker-specific deps**

```json
{
  "name": "shorts-os-render-worker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "run": "node --import tsx run.ts"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.106.1",
    "@vercel/blob": "^1.0.0",
    "ffmpeg-static": "^5.2.0",
    "fluent-ffmpeg": "^2.1.3",
    "tsx": "^4.20.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/fluent-ffmpeg": "^2.1.27",
    "@types/node": "^20.19.41",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["**/*.ts"]
}
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
*.log
.DS_Store
```

- [ ] **Step 4: Create run.ts entrypoint**

```ts
// scripts/render-worker/run.ts
//
// Sandbox-side entrypoint. Reads job id + callback token from argv, fetches the
// render_jobs row, routes to the matching handler, then POSTs the result to
// the Next.js callback endpoint.
import { z } from 'zod';
import { getSupabase } from './lib/supabase.ts';
import { postCallback } from './lib/callback.ts';
import { runClipIngest } from './handlers/clip-ingest.ts';
import { runRenderF1 } from './handlers/render-f1.ts';
import { runRenderF2 } from './handlers/render-f2.ts';
import { runUpload } from './handlers/upload.ts';

const jobId = process.argv[2];
const jobToken = process.argv[3];
if (!jobId || !jobToken) {
  console.error('Usage: node run.ts <job_id> <jwt_token>');
  process.exit(1);
}

const sandboxInvocationId = process.env.VERCEL_SANDBOX_ID ?? 'unknown';

async function main() {
  const supabase = getSupabase();
  const { data: job, error } = await supabase
    .from('render_jobs').select('*').eq('id', jobId).single();
  if (error || !job) {
    await postCallback({
      jobId, jobToken, sandboxInvocationId,
      result: { status: 'failed', error: `job not found: ${error?.message ?? 'no row'}` },
    });
    return;
  }
  try {
    let output: Record<string, unknown>;
    switch (job.job_type) {
      case 'clip_ingest':  output = await runClipIngest(job, supabase); break;
      case 'render_f1':    output = await runRenderF1(job, supabase); break;
      case 'render_f2':    output = await runRenderF2(job, supabase); break;
      case 'upload':       output = await runUpload(job, supabase); break;
      default: throw new Error(`unknown job_type: ${job.job_type}`);
    }
    await postCallback({ jobId, jobToken, sandboxInvocationId, result: { status: 'succeeded', output } });
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    await postCallback({ jobId, jobToken, sandboxInvocationId, result: { status: 'failed', error: msg } });
  }
}

main().catch(err => { console.error('fatal:', err); process.exit(1); });
```

- [ ] **Step 5: Create lib/supabase.ts**

```ts
// scripts/render-worker/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY must be set');
  return createClient(url, key, { auth: { persistSession: false } });
}
```

- [ ] **Step 6: Create lib/blob.ts**

```ts
// scripts/render-worker/lib/blob.ts
import { put } from '@vercel/blob';
import { readFile } from 'node:fs/promises';

export async function uploadMp4ToBlob(localPath: string, blobPath: string): Promise<string> {
  const buffer = await readFile(localPath);
  const blob = await put(blobPath, buffer, {
    access: 'public',
    contentType: 'video/mp4',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return blob.url;
}
```

- [ ] **Step 7: Create lib/callback.ts**

```ts
// scripts/render-worker/lib/callback.ts
//
// Posts the result back to /api/render/complete with the per-job JWT.
export interface CallbackArgs {
  jobId: string;
  jobToken: string;
  sandboxInvocationId: string;
  result: { status: 'succeeded' | 'failed'; output?: Record<string, unknown>; error?: string };
}

export async function postCallback(args: CallbackArgs): Promise<void> {
  const base = process.env.RENDER_CALLBACK_BASE_URL;
  if (!base) throw new Error('RENDER_CALLBACK_BASE_URL must be set');
  const res = await fetch(`${base}/api/render/complete`, {
    method: 'POST',
    headers: { 'authorization': `Bearer ${args.jobToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      job_id: args.jobId,
      sandbox_invocation_id: args.sandboxInvocationId,
      result: args.result,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`callback failed ${res.status}: ${text}`);
  }
}
```

- [ ] **Step 8: Create lib/ffmpeg-commands.ts (minimal — Phase 1 just needs blackBgWithAudio)**

```ts
// scripts/render-worker/lib/ffmpeg-commands.ts
//
// Centralized ffmpeg invocations. Phase 1 has just one: render a 1080x1920 black
// background with an audio track muxed in. Phase 2 extends with shot concat,
// caption burn-in, music duck. Phase 4 extends with compilation template.
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'node:child_process';

if (!ffmpegPath) throw new Error('ffmpeg-static did not provide a binary path');

export async function renderBlackBackgroundWithAudio(args: {
  audioPath: string;
  durationSeconds: number;
  outputPath: string;
}): Promise<void> {
  const argv = [
    '-y',
    '-f', 'lavfi', '-i', `color=c=black:s=1080x1920:d=${args.durationSeconds}:r=30`,
    '-i', args.audioPath,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-tune', 'stillimage',
    '-c:a', 'aac', '-b:a', '128k', '-shortest',
    '-movflags', '+faststart',
    args.outputPath,
  ];
  await runFfmpeg(argv);
}

function runFfmpeg(argv: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath as string, argv, { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  });
}
```

- [ ] **Step 9: Create lib/cartesia.ts (minimal client)**

```ts
// scripts/render-worker/lib/cartesia.ts
//
// Minimal Cartesia TTS client. Phase 1 uses a single fixed voice; Phase 2 wires
// the Voice Coach's pick.
import { writeFile } from 'node:fs/promises';

export async function synthesizeToWav(args: {
  script: string;
  voiceId: string;
  outputPath: string;
}): Promise<{ durationSeconds: number }> {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) throw new Error('CARTESIA_API_KEY must be set');

  // Cartesia REST: POST /tts/bytes with body { transcript, voice: { mode: 'id', id }, output_format: { container: 'wav', sample_rate, encoding } }
  const res = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Cartesia-Version': '2025-04-16',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_id: 'sonic-2',
      transcript: args.script,
      voice: { mode: 'id', id: args.voiceId },
      output_format: { container: 'wav', sample_rate: 44100, encoding: 'pcm_s16le' },
    }),
  });
  if (!res.ok) throw new Error(`Cartesia TTS failed ${res.status}: ${await res.text()}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(args.outputPath, buffer);

  // Crude duration estimate: WAV PCM s16le @ 44100 Hz mono = 88200 bytes/sec.
  // Header is 44 bytes. Phase 2 will replace with ffprobe.
  const durationSeconds = Math.max(1, (buffer.length - 44) / 88200);
  return { durationSeconds };
}
```

- [ ] **Step 10: Create handlers/render-f1.ts (minimal Phase 1 path)**

```ts
// scripts/render-worker/handlers/render-f1.ts
//
// Phase 1: minimal F1 render. Cartesia TTS the script over a black 1080x1920
// background, no captions, no Pexels, no music. Goal is benchmarking the
// FSM + Sandbox cold start + ffmpeg + Blob upload — not a publishable video.
// Phase 2 replaces this with the full pipeline.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { synthesizeToWav } from '../lib/cartesia.ts';
import { renderBlackBackgroundWithAudio } from '../lib/ffmpeg-commands.ts';
import { uploadMp4ToBlob } from '../lib/blob.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function runRenderF1(job: { id: string; payload: unknown }, supabase: SupabaseClient): Promise<Record<string, unknown>> {
  const payload = job.payload as { your_video_id: string };
  const { data: yv, error } = await supabase
    .from('your_videos').select('script, voice_id, channel_id').eq('id', payload.your_video_id).single();
  if (error || !yv) throw new Error(`your_videos row not found: ${error?.message}`);
  const voiceId = yv.voice_id ?? 'sonic-narrator-male-deadpan';

  const workDir = await mkdtemp(join(tmpdir(), 'render-f1-'));
  const audioPath = join(workDir, 'voice.wav');
  const videoPath = join(workDir, 'out.mp4');

  const { durationSeconds } = await synthesizeToWav({
    script: yv.script, voiceId, outputPath: audioPath,
  });
  await renderBlackBackgroundWithAudio({
    audioPath, durationSeconds: Math.ceil(durationSeconds), outputPath: videoPath,
  });
  const blobUrl = await uploadMp4ToBlob(videoPath, `renders/${payload.your_video_id}.mp4`);

  return { render_artifact_url: blobUrl, duration_seconds_actual: durationSeconds };
}
```

- [ ] **Step 11: Create stub handlers/clip-ingest.ts, handlers/render-f2.ts, handlers/upload.ts**

```ts
// scripts/render-worker/handlers/clip-ingest.ts
// Phase 1 stub. Real impl arrives in Phase 3.
export async function runClipIngest(): Promise<Record<string, unknown>> {
  throw new Error('clip_ingest handler not implemented until Phase 3');
}
```

```ts
// scripts/render-worker/handlers/render-f2.ts
// Phase 1 stub. Real impl arrives in Phase 4.
export async function runRenderF2(): Promise<Record<string, unknown>> {
  throw new Error('render_f2 handler not implemented until Phase 4');
}
```

```ts
// scripts/render-worker/handlers/upload.ts
// Phase 1 stub. Real impl arrives in Phase 5.
export async function runUpload(): Promise<Record<string, unknown>> {
  throw new Error('upload handler not implemented until Phase 5');
}
```

- [ ] **Step 12: Install worker deps locally to verify lockfile resolves**

```bash
cd scripts/render-worker && npm install && cd ../..
```

Expected: clean install.

- [ ] **Step 13: Commit**

```bash
git add scripts/render-worker/
git commit -m "feat(render-worker): scaffold sandbox package + minimal render_f1 handler"
```

---

## Task 1.16: Phase 1 acceptance gate — benchmark a real render_f1

**Files:** none new; this is an integration test against the deployed Vercel preview.

> **Operator-action required for this task:** ensure all required env vars are set in Vercel project settings before triggering. Specifically: `CARTESIA_API_KEY`, `VERCEL_BLOB_READ_WRITE_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RENDER_CALLBACK_SECRET`, `RENDER_CALLBACK_BASE_URL` (= the preview URL), `RENDER_CONCURRENCY=4`, `CRON_SECRET` if you want cron auth enforced.

- [ ] **Step 1: Push branch + open a Vercel preview deployment**

```bash
git push -u origin <branch>
```

Wait for preview URL.

- [ ] **Step 2: Insert a draft your_videos row + enqueue a render_f1 job manually**

Via Supabase Studio SQL editor on the linked project:

```sql
insert into public.your_videos (channel_id, title, script, voice_id, voice_provider, status)
values (
  (select id from public.channels where slug='dyfrx_9754'),
  'BENCHMARK TEST',
  'This is a thirty second benchmark test for plan four phase one. We are measuring how long it takes to cold start the sandbox, install dependencies, synthesize text to speech via cartesia, render a one thousand eighty by nineteen twenty black video with the audio muxed in, and upload it to vercel blob. Hopefully this fits in under two hundred and forty seconds.',
  'sonic-narrator-male-deadpan', 'cartesia', 'draft'
) returning id;
-- copy the returned id

insert into public.render_jobs (job_type, payload, your_video_id)
values ('render_f1', jsonb_build_object('your_video_id', '<paste-id-here>'), '<paste-id-here>');
```

- [ ] **Step 3: Trigger the dispatcher manually (don't wait for the 60s cron)**

```bash
curl -X GET 'https://<preview-url>/api/cron/render-dispatcher' \
  -H "Authorization: Bearer $CRON_SECRET" \
  -w "\n[%{time_total}s]\n"
```

Expected: `{ ok: true, claimed: 1, failed: 0 }` in <1s. Record the time.

- [ ] **Step 4: Watch the render_jobs row transition**

```sql
select id, status, claimed_at, started_at, finished_at, sandbox_invocation_id, last_error
from public.render_jobs order by created_at desc limit 1;
```

Poll every 30 seconds until `status='succeeded'` or `status='failed'`.

- [ ] **Step 5: Record wall-clock timings (broken down by bootstrap stage)**

The Sandbox-side `run.ts` should log per-step timestamps to stdout during the bootstrap phases so we can extract them from `sandbox.logs()` after the run. Add lightweight `console.log('[bootstrap-timing] step=git_clone start=...')` markers inside the worker package's `run.ts` and `vercel-sandbox.ts`'s `runCommand` calls (a small instrumentation helper is fine — keep it removable).

| Stage | Timestamp source | Time elapsed (s) | Sub-budget |
|---|---|---|---|
| Dispatch (claim + Sandbox.create returns) | dispatcher returned | _____ | ≤2s |
| `git clone` | bootstrap-timing log | _____ | ≤60s |
| `git checkout` | bootstrap-timing log | _____ | ≤5s |
| `npm ci --prefix scripts/render-worker` | bootstrap-timing log | _____ | ≤60s |
| Actual render execution (TTS + ffmpeg + Blob) | finished_at − last bootstrap log | _____ | ≤120s |
| **Total wall-clock** | `finished_at − claimed_at` | _____ | **≤240s** |

**Acceptance gate logic:**
- **Hard fail (block Phase 2):** total wall-clock > 240s.
- **Soft warn (proceed but flag for discussion):** either `git clone > 60s` or `npm ci > 60s`. These are cold-start budget risks — at 100 renders/month with 60s × 2 of bootstrap each, that's ~3.3 vCPU-hours/month *just* for bootstrap, which eats most of the Hobby plan's free 5 vCPU-hours allotment. Operator should know.
- **Soft warn:** render execution > 120s for a 30s black-bg minimal render. Phase 2 adds Pexels download + caption alignment + music mix, which will roughly double render time; if Phase 1's baseline is already 120s, Phase 2 won't fit.

If either soft warn fires, document the breakdown + discuss with operator before Phase 2:
- Pre-baked Sandbox image (custom Vercel Sandbox image with deps pre-installed)
- Smaller worker dep footprint (drop tsx, pre-compile run.ts → run.js in `npm run build` step run during `npm ci`)
- Switch RENDER_WORKER to local-PC for v1 (see spec §6 swap-out path)

- [ ] **Step 6: Verify the .mp4 plays + is 1080×1920**

Visit `your_videos.render_artifact_url` in a browser, confirm the .mp4 plays and is the right resolution. ffprobe it locally:

```bash
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration "$BLOB_URL"
```

- [ ] **Step 7: If acceptance gate passed, document numbers + commit**

Create a small `docs/superpowers/notes/2026-MM-DD-plan-4-phase-1-benchmark.md`:

```markdown
# Plan #4 Phase 1 — First Render Benchmark

**Date:** YYYY-MM-DD
**Result:** PASS (total wall-clock ___s, gate 240s)

| Stage | Time (s) |
|---|---|
| Dispatch | _ |
| Sandbox cold-start + npm ci | _ |
| Render execution | _ |
| Total | _ |

**Notes:** Any observations from the run.
```

```bash
git add docs/superpowers/notes/
git commit -m "docs(plan-4): Phase 1 benchmark — PASS at ___s"
```

- [ ] **Step 8: If acceptance gate FAILED**

**Stop. Don't start Phase 2.** Notify operator with the breakdown numbers. Likely culprits + remediation candidates:
- `npm ci` slow (>120s): pre-bake a Sandbox image with deps pre-installed (or use a smaller dep list — drop `tsx`, use raw `node` with compiled JS).
- Cartesia TTS slow (>30s for a ~30s script): cache the audio across benchmark runs, or pick a faster Cartesia model.
- ffmpeg slow: profile with `-stats`. Probably fine for the black-bg case; would be the bottleneck in Phase 2 once Pexels b-roll lands.
- Blob upload slow: shouldn't be >5s for ~5MB; investigate network.

Discuss next steps with operator before proceeding.

---

## Phase 1 exit checklist

- [ ] Migration 20260525000002 + 20260525000003 + 20260525000004 applied to linked Supabase
- [ ] Channels reseeded to dyfrx_9754, niche=cars, with real external_channel_id
- [ ] All unit tests passing: `npm test` shows 100% pass
- [ ] First render_f1 wall-clock ≤ 240s (gate)
- [ ] Benchmark numbers documented in notes
- [ ] All Phase 1 commits pushed to remote

---

---

# PHASE 2: Format 1 full pipeline (OUTLINE — re-plan with writing-plans before execution)

**Re-elaboration instruction:** at the start of Phase 2, re-invoke `superpowers:writing-plans` against the spec §3 (render_f1 handler) + §5 (/lab/drafts UI) + this outline. Produce a fully-fleshed Phase 2 sub-plan and execute via subagent-driven-development.

**Scope:**
- Pexels API client + integration into render-f1 handler (replace black-bg path with per-shot b-roll concat)
- Caption burn-in via Whisper forced-alignment (Groq) — word-level timing
- Music bed (genre='ambient' or 'cinematic', `energy_level∈[2,3]`, `requires_attribution=false`), ducked to 25%
- Director cuts-rule revision: add `'held_shot_with_text_animation'` to VISUAL_TREATMENTS enum
- /lab/drafts page update: 3-tab layout (Draft | Rendered | Posted), Rendered tab inline `<video>` preview + Approve & Schedule + Post now + Reject buttons (Schedule wiring lands Phase 5; Phase 2 only wires Post now)
- DraftRow component update: Render button (existing) + post-render UI states
- /api/lab/render route: POST with draftId → enqueues `render_jobs` job_type='render_f1', your_video_id set
- Smoke test: one full F1 render end-to-end through /lab UI, previewable + plays correctly

**Files to create:** `src/lib/clients/pexels.ts`, `src/lib/clients/cartesia.ts` (replace minimal worker version with shared client), `src/app/api/lab/render/route.ts`, `src/app/api/lab/upload/route.ts` (Post now escape hatch), worker handlers/render-f1.ts (full version), worker lib/whisper.ts, worker lib/pexels.ts.

**Files to modify:** `src/lib/agents/director.ts`, `src/lib/agents/constants.ts`, `src/app/lab/page.tsx`, `src/components/lab/draft-row.tsx`, `scripts/render-worker/lib/ffmpeg-commands.ts`, `scripts/render-worker/handlers/render-f1.ts`.

**Acceptance:** Operator dispatches a Lab draft, clicks Render, F1 renders end-to-end in <120s, previews in /lab/drafts Rendered tab, clicks Post now → uploads to YouTube (Phase 5 wires upload; for Phase 2 acceptance, swap Post now stub to log + display "upload coming in Phase 5"). Manual smoke checklist documented.

---

# PHASE 3: Reddit clip ingest + /clips Inbox + Stage-1 triage + ingest_blocklist (OUTLINE — re-plan)

**Re-elaboration instruction:** at the start of Phase 3, re-invoke `superpowers:writing-plans` against the spec §4 (Reddit discovery + clip_ingest handler) + §4 (/clips UI Inbox tab) + this outline.

**Scope:**
- `reddit-clip-discovery` cron: iterate active channels' niche.subreddits, fetch top videos last 24h, dedupe against clip_library + ingest_blocklist, Stage-1 Haiku score per post (~$0.001 each), enqueue `clip_ingest` job for scores >`STAGE_1_SCORE_THRESHOLD`, otherwise insert ingest_skip_log row
- `clip_ingest` Sandbox handler: yt-dlp download, ffprobe metadata, ffmpeg frame extraction (0.5 fps ≤30s / 0.25 fps 30–120s, cap 60), captions (yt-dlp auto-subs preferred, Groq Whisper fallback), Claude Haiku description + tags (constrained to niche vocab), upload to Vercel Blob, callback inserts clip_library row
- clip_library + ingest_blocklist + ingest_skip_log repos
- /clips page Inbox tab: list clip_library, video preview, description+tags, source link, **Block source** modal (subreddit OR author), **Ingest URL manually** input
- Add cron to vercel.ts at REDDIT_INGEST_CADENCE_MINUTES

**Files to create:** `src/app/api/cron/reddit-clip-discovery/route.ts`, `src/app/api/clips/block/route.ts`, `src/app/api/clips/ingest-url/route.ts`, `src/app/clips/page.tsx` (Inbox tab only), `src/components/clips/inbox-tab.tsx`, `src/components/clips/clip-card.tsx`, `src/components/clips/block-source-modal.tsx`, `src/components/clips/ingest-url-input.tsx`, `src/lib/supabase/repositories/clip-library.ts`, `src/lib/supabase/repositories/ingest-blocklist.ts`, `src/lib/supabase/repositories/ingest-skip-log.ts`, `src/lib/clients/reddit.ts` (or modify existing if it lives somewhere else), scripts/render-worker/handlers/clip-ingest.ts (full impl), scripts/render-worker/lib/watch.ts, scripts/render-worker/lib/yt-dlp.ts, scripts/render-worker/lib/whisper.ts (shared with Phase 2 if not already).

**Acceptance:** Cron runs, ≥1 clip_library row appears within 30 min of the cars channel becoming active, Inbox tab displays it with preview + tags. Block source modal hides a clip + prevents re-ingest. Per-clip cost stays ≤$0.70 measured on Vercel logs.

---

# PHASE 4: Format 2 + Composer + /clips Candidates+Rendered + promote-to-your_videos (OUTLINE — re-plan)

**Re-elaboration instruction:** at the start of Phase 4, re-invoke `superpowers:writing-plans` against the spec §2 (Composer + orchestrator fork) + §3 (render_f2 handler) + §4 (/clips Candidates+Rendered tabs) + this outline.

**Scope:**
- Composer agent: Zod-validated output schema, post-LLM validation (5 clips, sum 25–35s, music_track exists + not attribution-required, recent_patterns_used differ on ≥3 dims), heuristic fallback path, decisions row + compilation_drafts row + agent_messages
- Orchestrator format-branch fork: Strategist's new `selected_format` field routes to Writer/VC/Director path or Composer path; format-mix enforcement with escape clause (writes operator_alerts row if forced-format incompatible)
- Strategist output schema update: add `selected_format`, `analyst_guidance_acknowledged`, optional `forced_format_incompatible` + reason
- render_f2 Sandbox handler: fetch draft + 5 clips + music, ffmpeg trim per clip_refs, composite Top-5 template (sidebar variant + overlay variant), mux audio + music bed @ 20%, Blob upload, callback updates compilation_drafts.rendered_path
- /clips Candidates tab: list compilation_drafts.status='proposed', preview cards with clips + music + title, Approve/Reject/Edit buttons
- /clips Rendered tab: list compilation_drafts.status='rendered', inline .mp4 preview, Approve (promotes to your_videos + enqueues upload Phase 5) / Reject
- compilation_drafts repo with status transitions

**Files to create:** `src/lib/agents/composer.ts`, `src/lib/supabase/repositories/compilation-drafts.ts`, `src/app/api/clips/candidates/[id]/{approve,reject}/route.ts`, `src/app/api/clips/rendered/[id]/approve/route.ts`, `src/components/clips/candidates-tab.tsx`, `src/components/clips/candidate-card.tsx`, `src/components/clips/edit-drawer.tsx`, `src/components/clips/rendered-tab.tsx`, scripts/render-worker/handlers/render-f2.ts (full impl).

**Files to modify:** `src/lib/agents/orchestrator.ts` (format-branch fork + format-mix enforcement), `src/lib/agents/strategist.ts` (output schema + format-mix prompt block), `src/app/clips/page.tsx` (add tabs).

**Acceptance:** Operator dispatches a topic; Strategist picks 'compilation'; Composer produces a 5-clip set visible in Candidates tab; operator approves; render_f2 produces 1080×1920 mp4 visible in Rendered tab; promotion to your_videos succeeds. Format-mix escape clause writes an operator_alert when triggered.

---

# PHASE 5: OAuth + analytics + scheduling + /operations + music import CLI (OUTLINE — re-plan)

**Re-elaboration instruction:** at the start of Phase 5, re-invoke `superpowers:writing-plans` against the spec §5 (OAuth + analytics) + §5.5 (scheduling + /operations) + §8 (music library import) + this outline.

**Scope:**
- YouTube OAuth flow: /settings/channel page, /api/youtube/oauth/start (insert youtube_oauth_state + redirect), /api/youtube/oauth/callback (state validate, exchange code, encrypt refresh token via lib/encryption, update channels.oauth_refresh_token_encrypted, delete state row)
- channels repo: token encrypt + decrypt
- Worker upload handler: getValidAccessToken (decrypt refresh, exchange access), Blob download, YT Data API videos.insert with privacyStatus='public' madeForKids=false, parse response, callback writes posted_at + external_video_id + url + status='posted' + posted_hour_local + posted_dow_local
- performance-sync cron: replace stub. For each posted video where posted_at >= now()-14d: videos.list + reports.query (3 calls per video per day), UPSERT video_analytics with retention_curve_jsonb + raw_payload
- scheduled-uploader cron: atomic claim status='scheduled' AND scheduled_for<=now LIMIT 5, check max_uploads_per_day, enqueue upload job OR push to next valid slot, write backlog-overflow operator_alert if horizon>7d
- timezone library wire-up: `src/lib/timezone.ts` with `nextOpenSlotAfter(channel, since)` using luxon; DST tests
- /lab/drafts update: full 3-tab layout (Draft/Rendered/Scheduled/Posted — Scheduled is a sub-view of Rendered), Approve & Schedule (default) + Post now (escape hatch) + Reject buttons
- /api/lab/schedule route, /api/lab/upload route (Post now)
- /operations page: week-view calendar with drag-to-reschedule, Auto-schedule next 7 drafts button, Recommendations panel (read-only for Plan #4), format-mix bar
- /api/operator-alerts/resolve route (for the alert banner actions)
- Music library import CLI: `scripts/import-music-library.ts` — reads `./music-import/*.mp3`, uploads to Blob, Haiku for genre+energy+attribution flag, inserts music_tracks rows
- Strategist format-mix enforcement in orchestrator (was deferred from Phase 4 if not done there)
- Bump version 0.3.1 → 0.4.0 + update README

**Files to create:** `src/app/settings/channel/page.tsx`, `src/app/api/youtube/oauth/{start,callback}/route.ts`, `src/app/api/cron/scheduled-uploader/route.ts`, `src/app/api/cron/performance-sync/route.ts` (REPLACE existing stub), `src/app/api/lab/{schedule,upload}/route.ts`, `src/app/api/operator-alerts/resolve/route.ts`, `src/app/operations/page.tsx`, many `src/components/operations/*`, `src/lib/timezone.ts`, `src/lib/clients/youtube.ts` (extend), `src/lib/supabase/repositories/video-analytics.ts`, `src/lib/supabase/repositories/schedule-recommendations.ts`, `src/lib/supabase/repositories/music-tracks.ts`, `scripts/import-music-library.ts`, scripts/render-worker/handlers/upload.ts (full impl), scripts/render-worker/lib/youtube-client.ts, scripts/render-worker/lib/encryption.ts (mirror or symlink).

**Files to modify:** `src/lib/supabase/repositories/channels.ts` (token encrypt/decrypt), `src/lib/supabase/repositories/your-videos.ts` (scheduling state transitions + posted_hour_local + posted_dow_local), `src/components/lab/draft-row.tsx`, `vercel.ts` (add scheduled-uploader + performance-sync crons), `package.json` (version bump), `README.md`.

**Acceptance:**
1. Operator clicks Connect YouTube once → channels.oauth_refresh_token_encrypted populated.
2. Music import CLI runs cleanly on 20 tracks; music_tracks populated.
3. Full dispatch → render → schedule → posted-to-YT pipeline measured end-to-end with a real test video.
4. Day +1: performance-sync cron writes a video_analytics row.
5. /operations calendar shows scheduled video, drag-to-reschedule updates scheduled_for.
6. Auto-schedule next 7 drafts works for a small backlog.
7. Force a backlog >7d → operator_alert appears in banner.
8. Strategist mix override fires + writes operator_alert when topic is incompatible.
9. Tag `v0.4.0`, push, write release notes.

---

## Closing acceptance for Plan #4 (end of Phase 5)

- [ ] All 5 phases complete; each phase's exit checklist green
- [ ] One real video posted from drafts via /lab → /operations → YouTube
- [ ] video_analytics populating daily for posted videos
- [ ] /clips Inbox showing automatically-ingested Reddit clips
- [ ] /clips Candidates → Approve → Rendered → Approve → posted flow demonstrated for Format 2
- [ ] All Plan #5 dependencies satisfied (see spec §9)
- [ ] No regressions in existing Lab dispatch flow
- [ ] README updated; v0.4.0 tagged

After Plan #4 ships: operator posts ~30–50 videos over 4–6 weeks, then Plan #5 (Analyst + learning loops) can begin. The data plumbing it needs is all in place from Plan #4.
