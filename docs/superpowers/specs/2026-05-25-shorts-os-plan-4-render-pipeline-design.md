# Shorts OS — Plan #4: Render Pipeline Design

**Status:** Approved design. Implementation plan is the next step (via `superpowers:writing-plans`).

**Author:** Claude (chat session 2026-05-25), via Darius.

**Predecessors (read these first if you came in cold):**
- [Shorts OS master design](./2026-05-24-shorts-os-design.md) — section 5 (the Render layer) is what this plan ships, but superseded by the next two specs.
- [Clip-formats design](./2026-05-25-shorts-os-clip-formats-design.md) — established that there are three output formats, not one. This spec resolves its "Decision points / open questions" section.
- [Plan #5: Learning loops + The Analyst design](./2026-05-25-shorts-os-plan-5-learning-loops-design.md) — its "Dependencies on Plan #4" section is baked into this design.
- [/watch skill integration](./2026-05-25-watch-skill-integration.md) — used by the clip-ingest worker.
- [The Lab design (Plan #3)](./2026-05-24-shorts-os-the-lab-design.md) — defines the Strategist/Writer/Voice Coach/Director agents and the `your_videos.status='draft'` rows this pipeline consumes.

**Hard rules carried forward from master design (do not violate in this plan):**
1. **Channel-coherent dispatch** — the orchestrator already respects channel persona; render pipelines must not introduce content that contradicts the channel's niche.
2. **Operator approval is mandatory before posting** — no fully-autonomous publishing in v1. Every uploaded video has at least two operator clicks behind it (Render gate + Upload gate). Auto-approve is explicitly out of scope.
3. **Format-variation requirement** — every video on a channel must vary on at least 3 dimensions from the previous 5. Composer enforces this for Format 2 (see §6). For Format 1 the existing Director's `visual_treatment` enum + Writer's hook style already provide variation; no new mechanism needed here.
4. **Decision logging discipline** — every Claude-call agent writes a `decisions` row that's rich enough for The Analyst (Plan #5) to later correlate the decision with the outcome. Plan #4 adds two columns (`prompt_version`, `guidance_ids_used`) to `decisions` and requires every new agent (just Composer in this plan) to populate them.

---

## TL;DR

Plan #4 ships the part of Shorts OS that turns approved drafts into posted YouTube Shorts. After Plan #4, dispatch-to-posted is a fully automated pipeline gated by two operator clicks.

Two video formats render in v1:

- **Format 1 (narrated explainer):** Cartesia TTS + Pexels b-roll + ffmpeg assemble. Lab already produces `your_videos.status='draft'` rows for this format; Plan #4 makes them renderable.
- **Format 2 (Top-5 compilation):** new Composer agent assembles 5-clip sets from an auto-populated `clip_library`, deterministic Top-5 template renders the .mp4, operator approves at /clips. Format 2 is the operator-stated priority.

**Format 3 (streamer phonk edit) is out of scope.** Spec acknowledged; ship later.

The pipeline runs on **Vercel Sandbox** (microVMs, GA Jan 2026). A `render_jobs` queue + 60-second dispatcher cron + same-repo worker code is the architecture. Sandbox costs ≈ $0.01 per render; total Plan #4 ops cost projection $120–250/month at 10 clip-ingests/day + 100 renders/month.

Plan #4 also ships the data plumbing Plan #5 depends on: `video_analytics` table (renamed from existing `your_videos_analytics_snapshots`), real YouTube Analytics OAuth + sync (replacing the stub at [src/app/api/cron/performance-sync/route.ts](src/app/api/cron/performance-sync/route.ts)), and `decisions.prompt_version` + `decisions.guidance_ids_used` columns.

The whole render layer sits behind a `RenderWorker` interface in [src/lib/render/workers/types.ts](src/lib/render/workers/types.ts) — swapping to a local-PC render later is one new worker file + one env-var flip, with zero schema/agent/UI changes.

---

## What changes from current state (post-v0.3.1)

Today's state:
- `/lab` dispatches Strategist → Writer → Voice Coach → Director and produces a `your_videos.status='draft'` row.
- Nothing renders the .mp4. Nothing uploads to YouTube. `your_videos_analytics_snapshots` table exists but is empty; performance-sync cron is a stub.
- One channel seeded (`slug='default'`, niche=history). Cars niche doesn't exist.
- `clip_library`, `music_tracks`, `compilation_drafts`, `render_jobs`, `ingest_blocklist`, `youtube_oauth_state` tables don't exist.
- `decisions` table lacks `prompt_version` and `guidance_ids_used` columns.
- Visual treatments enum doesn't have `held_shot_with_text_animation`.

Plan #4 takes the codebase from "produces drafts" to "posts videos" with two operator gates per video.

---

## Architecture overview

```
┌───────────────────────────────────────────────────────────────────┐
│                        VERCEL (existing)                          │
│  ┌─────────────┐   ┌──────────────────────────────────────────┐   │
│  │  /lab UI    │   │ Orchestrator (server-only, async gen)    │   │
│  │  /clips UI  │──▶│   Strategist                             │   │
│  │  /lab/      │   │   ├ explainer → Writer → VC → Director   │   │
│  │  drafts UI  │   │   └ compilation → Composer (NEW)         │   │
│  └─────────────┘   └─────────────────┬────────────────────────┘   │
│         │                            │                            │
│         │ approves                   │ writes                     │
│         ▼                            ▼                            │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  SUPABASE                                                │    │
│  │  your_videos │ compilation_drafts │ clip_library │       │    │
│  │  music_tracks│ render_jobs        │ decisions    │       │    │
│  │  video_analytics │ channels │ niches │ …                 │    │
│  └──────────────────────────────────────────────────────────┘    │
│         ▲                                                         │
│         │ claims jobs, updates status                             │
│  ┌──────┴───────────────────────────────────────────────────┐    │
│  │  /api/cron/render-dispatcher (every 60s)                 │    │
│  │  /api/cron/reddit-clip-discovery (every 30 min)          │    │
│  │  /api/cron/render-watchdog (every 5 min)                 │    │
│  │  /api/cron/scheduled-uploader (every 15 min)             │    │
│  │  /api/cron/performance-sync (daily) [REPLACES stub]      │    │
│  │  /api/youtube/oauth/{start,callback}                     │    │
│  │  /api/render/complete (sandbox callback)                 │    │
│  │  /api/lab/{render,schedule,upload}, /api/clips/* etc.    │    │
│  └──────┬───────────────────────────────────────────────────┘    │
└─────────┼─────────────────────────────────────────────────────────┘
          │ dispatcher creates and detaches
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        VERCEL SANDBOX (NEW)                         │
│  One Node.js Sandbox image per claimed job. Boots, npm-installs     │
│  the worker package, runs the handler matching job_type, POSTs      │
│  result to /api/render/complete on success or failure.              │
│  Handlers:                                                          │
│    clip_ingest  — yt-dlp + /watch + Claude tag, → clip_library      │
│    render_f1    — Cartesia TTS + Pexels + ffmpeg, → render_artifact │
│    render_f2    — ffmpeg Top-5 template composite, → render_artifact│
│    upload       — YT Data API videos.insert, → your_videos.posted   │
└─────────────────────────────────────────────────────────────────────┘
```

The orchestrator's existing Lab dispatch loop continues to run inside a Vercel Function (Strategist/Writer/VC/Director/Composer all fit comfortably in the 300s Function envelope). Only the heavy workloads — clip ingest, render, upload — run in Sandbox.

---

## §1 — Schema changes

### Altered tables

**`your_videos`** — three new columns + status enum expanded:
```sql
alter table public.your_videos
  add column scheduled_for timestamptz,
  add column posted_hour_local int check (posted_hour_local between 0 and 23),
  add column posted_dow_local int check (posted_dow_local between 0 and 6);  -- 0=Sun
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
```
`posted_hour_local` and `posted_dow_local` are denormalized from `posted_at` + `channels.timezone` at upload-callback time (immutable thereafter). They exist so Plan #5's Analyst can compute time-of-day vs. retention correlations with a fast GROUP BY rather than runtime timezone math on every query.
The upload step *populates* `external_video_id`, `posted_at`, `url`, `status='posted'`, and `render_artifact_url` (all columns already exist per [supabase/migrations/20260524000006_create_your_videos.sql](supabase/migrations/20260524000006_create_your_videos.sql)). `external_channel_id` lives on `channels` and is joined, not denormalized. The new `scheduled` and `uploading` states are owned by the scheduled-uploader cron (see §5.5).

**`decisions`** — add two columns (Plan #5 carry-forward):
```sql
alter table public.decisions
  add column prompt_version text,
  add column guidance_ids_used uuid[] not null default '{}';
```
The orchestrator and every agent's decision write populates both, even though `guidance_ids_used` will always be `'{}'` during Plan #4 (Analyst doesn't exist yet). `prompt_version` is a hash of the agent's prompt template content — `crypto.createHash('sha256').update(promptTemplateString).digest('hex').slice(0, 16)` — so prompt drift over time is visible in retrospective analysis.

**Strategist output schema** — add two fields (no DB change; schema lives in [src/lib/agents/strategist.ts](src/lib/agents/strategist.ts) as Zod):
```ts
selected_format: z.enum(['explainer', 'compilation']),
analyst_guidance_acknowledged: z.boolean(),  // always false in Plan #4
```

**Strategist format-mix enforcement** — the orchestrator pre-computes a 7-day rolling format mix before invoking Strategist:
```ts
// orchestrator pseudocode, runs before Strategist call:
const recent = await getRecentFormatMix(channel.id, days=7);
// recent = { explainer: 0.72, compilation: 0.28, total_videos: 11 }
// channel.target_format_mix = { explainer: 0.60, compilation: 0.40 }
// Diff: explainer is +12% over target → bias toward compilation

// Pass mix block into Strategist's prompt:
//   "Last 7 days: 8 explainer + 3 compilation = 73% explainer, 27% compilation
//    Target: 60% explainer, 40% compilation
//    Bias your selected_format toward compilation unless the topic strongly
//    demands explainer treatment."
```

**Post-LLM validation in code (hard constraint with escape clause):** if `recent.total_videos >= 5` AND the chosen `selected_format` would push the 7-day ratio *further* outside target tolerance (±10% band), the orchestrator re-invokes Strategist once with explicit constraint `selected_format must be '<other>'`. Strategist's re-invocation can return one of two outcomes:

1. **Valid output with the forced format** — orchestrator proceeds normally; writes `decisions.outcome={mix_override: true, original: <strat picked>, forced: <other>}` for Plan #5 visibility.
2. **`forced_format_incompatible: true` flag** (new optional Strategist output field) — Strategist self-reports that the topic genuinely doesn't fit the forced format (e.g., topic is "what happened to the 1999 Pontiac Aztek" — narrative-historical, intrinsically explainer-shaped; cannot be a Top-5 compilation). In this case:
   - Orchestrator falls back to Strategist's **original** `selected_format` choice (no override forced).
   - Writes `decisions.outcome={mix_override_skipped: true, reason: 'topic_incompatible', original_kept: <format>}`.
   - Inserts a row in the new `operator_alerts` table (see §1 schema additions below) with `category='format_mix_drift'`, `message=` something like "Compilation under-target this week (current 27%, target 40%); 2 recent topics were incompatible with the forced format. Consider seeding compilation-friendly topics into topic_queue (crash compilations, fail roundups, mechanic-disaster lists)."
   - The /operations page surfaces unresolved `operator_alerts` rows in a top-banner.

Don't silently fall back — the alert is the whole point. Operators need to know when the mix is drifting because of topic-supply imbalance, not because the agents are misbehaving.

The validator skips both branches when `recent.total_videos < 5` (avoids unsatisfiable rules during cold-start; same logic as the Composer's "differ from last 5" rule). The ±10% tolerance band is configurable via `FORMAT_MIX_TOLERANCE_PCT` env var (default 10).

**`VISUAL_TREATMENTS`** enum in [src/lib/agents/constants.ts](src/lib/agents/constants.ts) — add `'held_shot_with_text_animation'` as a new option, with Director prompt template documenting "use when the hook is text-driven and constant visual would help retention." This addresses the /watch finding (2/3 viral Shorts had zero cuts in first 3s).

### Renamed table

`your_videos_analytics_snapshots` → **`video_analytics`** (matches Plan #5 spec naming; table is currently empty so rename is safe). Schema after rename:

```sql
alter table public.your_videos_analytics_snapshots rename to video_analytics;
alter table public.video_analytics rename column video_id to your_video_id;
alter table public.video_analytics
  add column shares bigint,
  add column impressions bigint,
  add column watch_time_seconds bigint,
  add column retention_curve_jsonb jsonb,
  add column raw_payload jsonb;
-- Existing index renamed to match:
alter index yv_analytics_video_idx rename to video_analytics_video_idx;
```

### New tables

**`clip_library`** — auto-ingested third-party clips for Format 2:
```sql
create table public.clip_library (
  id uuid primary key default uuid_generate_v4(),
  source_url text not null,
  source_platform text not null check (source_platform in ('youtube','tiktok','reddit','twitch','upload')),
  source_creator text,
  local_path text not null,                  -- Vercel Blob URL
  duration_seconds numeric not null,
  width int,
  height int,
  description text,                          -- Claude-generated from frames+transcript
  tags text[] not null default '{}',         -- controlled vocabulary from niche row
  niche_id uuid references public.niches(id) on delete set null,
  added_at timestamptz not null default now(),
  added_by text not null,                    -- 'reddit_ingest' | 'manual' | future scrapers
  unique (source_url)
);
create index clip_library_tags_idx on public.clip_library using gin (tags);
create index clip_library_niche_idx on public.clip_library (niche_id, added_at desc);
```

**`music_tracks`** — operator-curated YouTube Audio Library tracks:
```sql
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
```

`requires_attribution=true` tracks are excluded from Composer selection in v1 (operator brief confirmed). v1.5 will add an automated description-builder that injects credits and then unlocks attribution-required tracks.

**`compilation_drafts`** — Format 2 draft state:
```sql
create table public.compilation_drafts (
  id uuid primary key default uuid_generate_v4(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  topic_queue_id uuid references public.topic_queue(id) on delete set null,
  theme text not null,
  title_template text not null,
  accent_word text not null,
  title_formula_id text not null,            -- 'ranking_best' | 'top_5' | ...
  reveal_pattern text not null check (reveal_pattern in ('chronological','dramatic','reverse_rank')),
  caption_style text not null check (caption_style in ('descriptive','reactive','mixed')),
  layout_variant text not null default 'top5_sidebar'
    check (layout_variant in ('top5_sidebar','top5_overlay')),
  clip_refs jsonb not null,                  -- [{clip_id, start_sec, end_sec, label, order}]
  music_track_id uuid references public.music_tracks(id) on delete set null,
  status text not null default 'proposed' check (status in (
    'proposed','approved','rejected','rendering','rendered','posted','failed'
  )),
  rendered_path text,                        -- Vercel Blob URL of final .mp4
  promoted_your_video_id uuid references public.your_videos(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index compilation_drafts_channel_status_idx on public.compilation_drafts (channel_id, status, created_at desc);
create index compilation_drafts_recent_patterns_idx on public.compilation_drafts (channel_id, created_at desc)
  where status in ('posted','rendered');
```

The `title_formula_id`, `reveal_pattern`, `caption_style`, `layout_variant` columns are explicit (not buried in `clip_refs` JSONB) so the Composer's "must differ from last 5" SQL filter is fast.

**`render_jobs`** — the queue:
```sql
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
```

**`ingest_blocklist`** — sources to skip in the Reddit discovery cron:
```sql
create table public.ingest_blocklist (
  id uuid primary key default uuid_generate_v4(),
  source_platform text not null check (source_platform in ('reddit','youtube','tiktok')),
  identifier text not null,                  -- subreddit name or username
  identifier_type text not null check (identifier_type in ('subreddit','author')),
  reason text,
  added_by text not null default 'operator',
  added_at timestamptz not null default now(),
  unique (source_platform, identifier_type, identifier)
);
```

**`ingest_skip_log`** — Stage-1 triage audit trail:
```sql
create table public.ingest_skip_log (
  id uuid primary key default uuid_generate_v4(),
  source_platform text not null,
  source_url text not null,
  stage_1_score int not null,                -- 0-100
  reasoning text,
  skipped_at timestamptz not null default now()
);
create index ingest_skip_log_recent_idx on public.ingest_skip_log (skipped_at desc);
```

Lets us tune the Stage-1 threshold over time by reviewing what got rejected.

**`youtube_oauth_state`** — short-lived CSRF state for the OAuth consent flow:
```sql
create table public.youtube_oauth_state (
  state text primary key,
  channel_id uuid not null references public.channels(id) on delete cascade,
  created_at timestamptz not null default now()
);
-- Cleanup: a small SQL helper run from the callback handler deletes rows older than 10 minutes
```

**`channels`** — added columns:
```sql
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
```

- `max_clip_ingest_per_day`: Reddit discovery cron counts today's clip_ingest jobs per channel and skips channels at cap.
- `timezone`: IANA timezone the schedule is interpreted in. Defaults to ET.
- `posting_schedule`: weekday + weekend slot times. Defaults pulled from current YT Shorts best practices (weekday morning + evening commute, weekend brunch + evening). Format is two arrays of `HH:MM` strings; the scheduled-uploader interprets these as channel-local time per `timezone`.
- `target_format_mix`: enforced by the Strategist (see §2). Defaults to 60% explainer / 40% compilation; tunable per channel via the /operations page.

**`operator_alerts`** (new table — surfaces non-blocking situations that need operator awareness):
```sql
create table public.operator_alerts (
  id uuid primary key default uuid_generate_v4(),
  channel_id uuid references public.channels(id) on delete cascade,
  category text not null check (category in (
    'format_mix_drift','schedule_backlog_overflow','cost_spike',
    'oauth_token_revoked','clip_ingest_zero_yield','analyst_recommendation'
  )),
  severity text not null default 'info' check (severity in ('info','warn','error')),
  message text not null,                     -- human-readable, surfaced verbatim in /operations banner
  suggested_actions jsonb,                   -- [{label, action_type, params}] for one-click resolutions
  context jsonb,                             -- structured context (e.g., {current_mix, target_mix, blocked_topics})
  status text not null default 'unresolved'
    check (status in ('unresolved','acknowledged','resolved','dismissed')),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index operator_alerts_unresolved_idx on public.operator_alerts (channel_id, severity, created_at desc)
  where status in ('unresolved','acknowledged');
```
Used by §2's format-mix escape clause, §5.5's backlog-overflow guardrail, and (in Plan #5) Analyst recommendations. The /operations page shows unresolved alerts in a top banner; the operator clicks Acknowledge or Resolve to move them out of the active set.

**`schedule_recommendations`** (new table — populated in Plan #5 by the Analyst, but the table ships in Plan #4 so the /operations UI can read from it):
```sql
create table public.schedule_recommendations (
  id uuid primary key default uuid_generate_v4(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  analyst_run_id uuid,                       -- nullable in Plan #4; Plan #5 populates
  recommended_posting_schedule jsonb,        -- same shape as channels.posting_schedule
  recommended_format_mix jsonb,              -- same shape as channels.target_format_mix
  evidence jsonb not null,                   -- { videos: uuid[], stat: { ... } }
  confidence text not null check (confidence in ('low','medium','high')),
  status text not null default 'pending'
    check (status in ('pending','applied','dismissed','superseded')),
  applied_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);
create index schedule_recs_channel_status_idx
  on public.schedule_recommendations (channel_id, status, created_at desc);
```

### Channel + niche reseed migration

Single migration, runs in Phase 1 before any other Plan #4 code paths can be exercised:

```sql
insert into public.niches (slug, display_name, description,
  subreddits, youtube_search_terms, tiktok_hashtags) values
('cars', 'Cars', 'Car crashes, street racing, mechanic fails, driving content',
  array['IdiotsInCars','JustRolledIntoTheShop','Cartalk','cars','RoastMyCar',
        'spotted','formuladank','carporn'],
  array['car crash compilation','street race fails','mechanic fail',
        'driver fail','dashcam','car review shorts'],
  array['carcrash','dashcam','streetrace','idiotsindriving','carfail']);

update public.channels
  set slug='dyfrx_9754',
      display_name='dyfrx_9754',
      external_channel_id=<OPERATOR-PROVIDED>,
      niche_id=(select id from public.niches where slug='cars'),
      persona=<CARS-PERSONA-JSONB — written in implementation plan>,
      default_voice_id=<picked from VOICE_POOL in implementation plan>,
      default_tts_provider='cartesia'
  where slug='default';
```

Operator confirms during Phase 1: the YT channel ID and the subreddit list above are correct.

---

## §2 — Orchestrator + agents

### Orchestrator branches after Strategist

Today's orchestrator at [src/lib/agents/orchestrator.ts:38](src/lib/agents/orchestrator.ts:38) hardcodes Strategist → Writer → VC → Director. Plan #4 forks on Strategist's new `selected_format`:

```
                Strategist (now emits selected_format)
                       │
            ┌──────────┴──────────┐
            │                     │
       'explainer'           'compilation'
            │                     │
        Writer               Composer (NEW)
        Voice Coach               │
        Director                  │
            │                     │
            ▼                     ▼
       your_videos          compilation_drafts
       status='draft'       status='proposed'
```

The fork is one switch in `runPipeline`; everything before the fork (concurrency check, context load, job row creation, Strategist call) stays unchanged. After the fork, each branch is its own helper function that yields the same `StreamEvent` shape so the SSE stream to /lab continues to work transparently.

### The Composer (new Claude agent)

Location: [src/lib/agents/composer.ts](src/lib/agents/composer.ts).

**Input context** (built by the orchestrator before the Claude call):
- Topic + channel + niche
- Strategist's `dispatch_directive` + chosen theme keywords
- Candidate pool: SQL query against `clip_library` filtered by `niche_id` + tag overlap with strategist keywords, `added_at >= now() - interval '30 days'`, ordered by tag-overlap count desc, LIMIT 30. None of these clips were previously used in this channel's `compilation_drafts.clip_refs` in the last 7 days.
- `recent_patterns_used`: the last 5 channel uploads' `(title_formula_id, reveal_pattern, caption_style, music_track_id.genre, music_track_id.energy_level)` tuples.
- Music candidate pool: rows from `music_tracks` where `requires_attribution=false` and `energy_level in (2,3)`.

**Claude call** (Haiku 4.5, `generateObject`):
- Input: candidate clips with description + tags + duration + the strategist theme + the recent_patterns_used summary.
- Output schema (Zod):
  ```ts
  z.object({
    title_template: z.string().min(8).max(60),
    accent_word: z.string().min(2).max(20),
    title_formula_id: z.enum(['ranking_best','top_5','you_wont_believe','when_gone_wrong',
                               'gone_wrong','my_favorite','reacting_to']),
    reveal_pattern: z.enum(['chronological','dramatic','reverse_rank']),
    caption_style: z.enum(['descriptive','reactive','mixed']),
    layout_variant: z.enum(['top5_sidebar','top5_overlay']),
    clip_refs: z.array(z.object({
      clip_id: z.string().uuid(),
      start_sec: z.number().min(0),
      end_sec: z.number().min(0),
      label: z.string().min(2).max(80),
      order: z.number().int().min(1).max(5),
    })).length(5),
    music_track_id: z.string().uuid(),
    rationale: z.string(),
  })
  ```

**Post-LLM validation** (in code, never relied on the model to enforce):
- All `clip_id` values exist in `clip_library`.
- Sum of `(end_sec - start_sec)` is between 25 and 35.
- Each `(end_sec - start_sec)` is in `[4, 9]`.
- `music_track_id` exists in `music_tracks` and `requires_attribution=false`.
- The chosen `(title_formula_id, reveal_pattern, caption_style)` triple differs from each of the last 5 patterns on at least 3 of the 4 named dimensions (formula, reveal, caption, music energy).
- `layout_variant='top5_overlay'` is weighted 1:4 vs `top5_sidebar` (Composer's prompt guides toward this ratio; validator does not enforce per-call — only checked aggregately during pre-render review if needed).

If validation fails: retry once with a more constrained prompt. If retry fails: fall back to a heuristic picker (pick top 5 by tag-overlap, default formula = `ranking_best`, default reveal = `dramatic`, default caption = `mixed`, random music_track from the candidate pool). Fall-back path writes `decisions.outcome={fallback: true, reason}` for Plan #5 visibility.

**Writes:**
- `decisions` row: `agent_id='composer'`, `decision_type='compilation_assembly'`, `alternatives` = the full 30-row candidate pool, `chosen` = the 5 picked + the formula/reveal/caption/layout triple, `inputs` = the recent_patterns_used summary so Plan #5 can correlate.
- `agent_messages`: `from_agent='strategist'`, `to_agent='composer'`, `intent='compilation_brief'`.
- `compilation_drafts` row with `status='proposed'`.
- Job row in the existing `jobs` table updated to `current_agent='composer'`.

A new `agents` row is seeded (`id='composer'`) in the Phase 1 migration alongside the channel reseed.

### Format-variation discipline (master-spec Hard Rule #4 compliance)

The Composer enforces 5-dimensional variation through its `recent_patterns_used` prompt input + post-LLM validator. **Limitation acknowledged:** the fixed Top-5 layout *itself* (title bar + sidebar + numbered list + main viewport) is structural and won't change between videos. Mitigation in v1: `layout_variant='top5_overlay'` (no sidebar; numbered captions over the clip) is occasionally selected (~1 in 5 videos). Further structural variation (color-grade per video, operator-talking-head intros) is deferred — none of it is Plan #4 scope.

---

## §3 — Render worker

### Job FSM

```
   pending
     │
     │  dispatcher claims atomically (UPDATE … RETURNING)
     ▼
   claimed
     │
     │  Sandbox.create() + runCommand({detached:true}) succeeded
     ▼
   running
     │  ┌─── sandbox POSTs /api/render/complete ───┐
     │  │                                          │
     ▼  ▼                                          ▼
   succeeded                                    failed
                                                  │
                                                  │ attempts < 3 → reset to pending (attempts++)
                                                  │ attempts = 3 → terminal
```

**Watchdog cron** (`/api/cron/render-watchdog`, runs every 5 minutes):
- Any row with `status='claimed'` and `claimed_at < now() - interval '5 minutes'` → reset to `pending`, `attempts++` (dispatcher crashed before kicking off Sandbox).
- Any row with `status='running'` and `started_at < now() - interval '30 minutes'` → reset to `pending`, `attempts++` (Sandbox crashed without calling back). After `attempts=3`, status stays `failed` and `last_error='watchdog_max_attempts'`.

### Dispatcher cron

[src/app/api/cron/render-dispatcher/route.ts](src/app/api/cron/render-dispatcher/route.ts), runs every 60 seconds:

```ts
// 1. Atomic claim (up to RENDER_CONCURRENCY rows):
//      with claimable as (
//        select id from render_jobs
//        where status='pending'
//        order by created_at
//        limit $1
//        for update skip locked
//      )
//      update render_jobs r set status='claimed', claimed_at=now()
//      from claimable c where r.id = c.id returning r.*;
//
// 2. For upload jobs only: filter out rows for channels at max_uploads_per_day.
//    (Rows stay claimed momentarily; watchdog will reclaim them next tick.)
//    Cleaner: skip the claim in step 1 by joining channels and filtering — done as a subquery.
//
// 3. For each claimed job:
//      token = jwt.sign({ job_id, exp: now + 15min }, RENDER_CALLBACK_SECRET)
//      sandbox = await Sandbox.create({
//        timeout: '15m',
//        runtime: 'node22',
//        // ports omitted; sandbox makes outbound calls only
//      })
//      await sandbox.runCommand({
//        cmd: 'node',
//        args: ['/repo/scripts/render-worker/run.js', job.id, token],
//        detached: true,
//        env: { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//               CARTESIA_API_KEY, PEXELS_API_KEY, GROQ_API_KEY,
//               VERCEL_BLOB_READ_WRITE_TOKEN, RENDER_CALLBACK_BASE_URL,
//               GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET,
//               OAUTH_TOKEN_ENCRYPTION_KEY_V1, OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION },
//      })
//      await db.update(render_jobs, { id: job.id, status: 'running',
//        sandbox_invocation_id: sandbox.id, started_at: now() })
//
// 4. Return in <1s
```

`RENDER_CONCURRENCY` env var default 4. The `for update skip locked` clause prevents two dispatcher invocations from claiming the same row.

### Sandbox-side worker code

Lives in [scripts/render-worker/](scripts/render-worker/) in this repo (not a separate deploy):

```
scripts/render-worker/
  ├── run.ts                  # entrypoint: read job_id + token, fetch job, route by job_type
  ├── package.json            # ffmpeg-static, yt-dlp-exec, @vercel/blob, googleapis, cartesia
  ├── tsconfig.json
  ├── handlers/
  │   ├── clip-ingest.ts
  │   ├── render-f1.ts
  │   ├── render-f2.ts
  │   └── upload.ts
  └── lib/
      ├── ffmpeg-commands.ts  # every ffmpeg invocation centralized + unit-testable
      ├── blob.ts             # Vercel Blob put/get helpers
      ├── youtube-client.ts   # OAuth refresh + Data API + Analytics API
      ├── watch.ts            # /watch skill components (ffmpeg frames + Whisper)
      ├── encryption.ts       # AES-256-GCM with key-version dispatch
      └── supabase.ts         # service-role client
```

Sandbox boots: `npm ci` (only the worker package's deps), then `node run.js <job_id> <token>`.

**Callback contract** — sandbox POSTs `/api/render/complete` on success or failure:
```
POST /api/render/complete
Authorization: Bearer <per-job JWT>
Content-Type: application/json
Body: {
  job_id: uuid,
  sandbox_invocation_id: string,
  result: { status: 'succeeded' | 'failed', error?: string,
            output: { /* job-type-specific */ } }
}
```

Callback handler:
1. Verifies JWT signature against `RENDER_CALLBACK_SECRET`; rejects if expired.
2. Atomic state transition: `update render_jobs set status=?, finished_at=now() where id=? and status='running'`. If 0 rows updated, the row already transitioned (idempotent — second call is a safe no-op).
3. Applies side-effects by job_type (see §3 handler details below).

### Handler details

#### `clip_ingest`
**Payload:** `{ source_url, niche_id, source_creator?, post_metadata? }`

**Steps:**
1. `yt-dlp` downloads the source video to `/tmp/clip.mp4`.
2. `ffprobe` extracts `duration_seconds`, `width`, `height`. Reject if `duration > 600s` or `width/height` ratio is wider than 16:9 (we want vertical or square sources).
3. ffmpeg pulls frames: at 0.5 fps for clips ≤30s, 0.25 fps for 30–120s, capped at 60 frames total. Written to `/tmp/frames/frame_*.jpg`.
4. Captions: try `yt-dlp --write-auto-subs --skip-download` on the source URL first. If no captions, Whisper-large via Groq API on the audio extracted by ffmpeg.
5. Single Claude Haiku call: `[frames + transcript + niche tag vocabulary]` → `{ description: string, tags: string[] (constrained to niche vocab) }`.
6. Upload the .mp4 to Vercel Blob: `clip-library/{uuid}.mp4`.
7. POST callback with `output = { source_url, source_platform, source_creator, local_path, duration_seconds, width, height, description, tags, niche_id, added_by }`.

**Callback side-effect:** insert into `clip_library`.

**Per-clip cost ceiling:** ~$0.30–0.70 (Haiku on ~30–60 frames + light Whisper).

#### `render_f1`
**Payload:** `{ your_video_id }`

**Steps:**
1. Fetch `your_videos` row + the Director's shot_list (stored in `decisions` table).
2. Cartesia TTS: synthesize the full script (one or chunked calls) at the voice_id picked by Voice Coach. Save WAV to `/tmp/voice.wav`.
3. Pexels API: for each shot in the shot_list, search by keywords, download top-match vertical clip to `/tmp/shot_N.mp4`.
4. Pick a `music_tracks` row (genre='ambient' or 'cinematic', `energy_level in (2,3)`, `requires_attribution=false`). Download to `/tmp/music.mp3`.
5. Whisper forced-alignment on the TTS audio → word-level timing for caption burn-in.
6. ffmpeg single pass: concat shots, scale/crop to 1080×1920, mux TTS audio over music bed (music ducked to 25% under voice), burn captions, encode H.264 + AAC, target ~60s.
7. Upload final .mp4 to Vercel Blob: `renders/{your_video_id}.mp4`.
8. POST callback with `output = { render_artifact_url, duration_seconds_actual }`.

**Callback side-effect:** update `your_videos.render_artifact_url`, `status='rendered'`. **No auto-chain to upload** — operator gates that at /lab/drafts.

**Per-render cost:** ~$0.02 Sandbox + ~$0.015 Cartesia + ~free Pexels + ~free Groq ≈ **$0.04 per video**.

#### `render_f2`
**Payload:** `{ compilation_draft_id }`

**Steps:**
1. Fetch `compilation_drafts` row + the 5 `clip_library` rows referenced.
2. Download each clip from Vercel Blob to `/tmp/clip_N.mp4`.
3. Download the chosen `music_tracks` row to `/tmp/music.mp3`.
4. ffmpeg per-clip pre-pass: trim each to `[start_sec, end_sec]`, scale to fit the main-viewport region of the template.
5. ffmpeg composite pass: lay out the template (top 10% title bar with the `title_template` text + accent_word highlighted; left 25% sidebar showing labels appearing at each clip's start per `reveal_pattern`; main 65% viewport playing the trimmed clip sequence) OR the `top5_overlay` variant (no sidebar; numbered captions overlay on the clip). Mux clip audio + music bed (music ducked to 20%).
6. Upload final .mp4 to Vercel Blob: `renders/compilation/{compilation_draft_id}.mp4`.
7. POST callback with `output = { rendered_path, duration_seconds_actual }`.

**Callback side-effect:** update `compilation_drafts.rendered_path`, `status='rendered'`. Surfaces in /clips Rendered tab. **No auto-chain to upload** — operator gates that at /clips.

**Per-render cost:** ~$0.01 Sandbox + free everything else ≈ **$0.01 per video**.

#### `upload`
**Payload:** `{ your_video_id }`

**Steps:**
1. Fetch `your_videos` row. Reject if `render_artifact_url` is null or `status not in ('rendered','uploading')` (where `'rendered'` covers the immediate "Post now" path and `'uploading'` covers the scheduled-uploader path; see §5.5). Transition `status='uploading'` if not already there.
2. Download the .mp4 from Vercel Blob.
3. Fetch `channels.oauth_refresh_token_encrypted` for the channel, decrypt via the worker's `encryption.ts` (matches key version), exchange refresh → access token at Google's token endpoint.
4. YT Data API `videos.insert` with the .mp4 + title + description + tags + `categoryId='22'` (People & Blogs) + `madeForKids=false` + `privacyStatus='public'`.
5. Parse response: `external_video_id = response.id`, `url = 'https://youtube.com/shorts/' + response.id`.
6. POST callback with `output = { external_video_id, url, posted_at: now() }`.

**Callback side-effect:** update `your_videos.external_video_id`, `url`, `posted_at`, `status='posted'`. Plan #5's Performance Sync picks up from here.

**Per-upload cost:** ~$0 (YT API is free at our quota).

### Encryption (key-rotation-friendly)

`channels.oauth_refresh_token_encrypted` is JSON of shape:
```json
{
  "version": 1,
  "iv": "base64",
  "tag": "base64",
  "ciphertext": "base64"
}
```

Encryption is AES-256-GCM. Env vars: `OAUTH_TOKEN_ENCRYPTION_KEY_V1` (32-byte hex), `OAUTH_TOKEN_ENCRYPTION_KEY_V2` (added at first rotation), ..., plus `OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION=1`.

Read path: parse `version` from ciphertext JSON, look up the matching `KEY_V<n>` env var, decrypt. Throws if the version's key isn't configured.

Write path: always use `KEY_V<CURRENT_VERSION>`.

Rotation playbook: (1) add `KEY_V2`, deploy. (2) flip `CURRENT_VERSION=2`, deploy. (3) old rows continue decrypting with `KEY_V1`; new writes use `KEY_V2`. (4) opportunistic re-encrypt happens whenever a refresh-token row is rewritten (e.g., next OAuth reconsent) — no batch re-encrypt job needed for v1.

---

## §4 — Clip ingest pipeline + Composer + /clips UI

### 🎬 REMOTION FEATURE INTEGRATION MAP (READ THIS BEFORE PLANNING PHASES 3–5)

Phase 2.5 ships **only animated word-by-word captions** as a Remotion composition. The remaining 5 Remotion feature categories live as empty scaffold directories in `src/remotion/compositions/` and **MUST be built progressively as part of Phases 3, 4, and 5 below** — NOT deferred to a separate future plan. Every phase's implementation plan must include the Remotion features assigned to it.

| Remotion feature | Owning phase | Why this phase |
|---|---|---|
| **Smooth transitions between b-roll clips** (zoom, slide, whip-pan, glitch swipe) | **Phase 3** (clip ingest) | Transitions matter most when multiple clip sources compose a video. Phase 3 is when `clip_library` populates and multi-clip composition becomes routine. Director agent gains `transition_props` field per shot. |
| **Lower-thirds** (source credits like "Source: r/IdiotsInCars" with motion) | **Phase 3** (clip ingest) | Reddit-sourced clips require attribution per the clip-formats spec. Lower-thirds satisfy attribution AND format-variation Hard Rule #4. Director picks when to overlay. |
| **Title cards for Format 2 compilations** (animated "#5 → #4 → #3" intros) | **Phase 4** (Composer agent) | Title cards are CORE to the Top-5 format — not optional. Composer's output schema gains `title_card_props` (variant, accent_color, animation_speed). Built as `src/remotion/compositions/title-cards/numbered-countdown.tsx`. |
| **Animated callouts/stickers** ("WAIT FOR IT", arrows, emoji bounces) | **Phase 4** (Composer / Format 2) | Compilation videos use climax markers and emphasis stickers. Director identifies climax moments; Composer schedules callouts. Built as `src/remotion/compositions/callouts/*`. |
| **Branded intros/outros** (3-sec opener with channel branding + outro CTA) | **Phase 5** (Channel-level config + /settings/channel page) | Intros/outros are per-channel brand assets. The /settings/channel page (added in Phase 5 for OAuth) gains an "Intro/Outro Config" section where operator picks variant + accent. Built as `src/remotion/compositions/intros/*` and `outros/*`. |
| **Lottie animation integration** (loading spinners, callout flourishes from LottieFiles) | **Phase 2.5 infrastructure expansion** | Lottie pipeline scaffolded in 2.5 (asset folder + Blob upload + indexer). Phase 3+ agents pull Lottie assets from the indexed library when relevant. No dedicated phase work beyond the indexer. |

**Acceptance gate for each phase:** the Remotion features assigned above ship as functional compositions with Zod props, Director/Composer agent picks per-video variants, and the format-variation Hard Rule #4 is satisfied across recent videos using the new feature.

**For the implementation-plan author:** when you write Plan #4 Phase 3, you MUST include tasks for the transitions + lower-thirds Remotion compositions. When you write Phase 4, you MUST include tasks for title cards + callouts. When you write Phase 5, you MUST include tasks for intros/outros. Don't ask the operator whether to build them — they're required by this spec.

---

### Reddit clip discovery cron

[src/app/api/cron/reddit-clip-discovery/route.ts](src/app/api/cron/reddit-clip-discovery/route.ts), runs every `REDDIT_INGEST_CADENCE_MINUTES` minutes (env default 30):

```
for each active channel where niche_id is not null:
  if today's clip_ingest job count for this channel >= channels.max_clip_ingest_per_day: continue
  for each subreddit in niche.subreddits:
    fetch top posts of last 24h
    for each video post:
      if (source_platform='reddit', identifier_type='subreddit', identifier=subreddit) in ingest_blocklist: skip
      if (source_platform='reddit', identifier_type='author', identifier=post.author) in ingest_blocklist: skip
      if (source_url) already in clip_library: skip
      # Stage 1: cheap triage
      score = await haiku_score(post.title, post.subreddit, post.score, post.num_comments)
      if score < STAGE_1_SCORE_THRESHOLD (default 60):
        insert ingest_skip_log row; continue
      # Stage 2: enqueue full ingest
      insert render_jobs row (job_type='clip_ingest', payload={source_url, niche_id, source_creator})
      remaining_quota -= 1
      if remaining_quota <= 0: break
```

**Stage-1 cost:** ~$0.001 per scored post. **Net daily Claude spend at cap of 10 full ingests:** ~$3–7/day from Stage 2 + a few cents from Stage 1.

### Composer

Already specified in §2 above. Reproduces here for the /clips UI consumer view:
- Composer is invoked synchronously from the orchestrator when `selected_format='compilation'`.
- Writes `compilation_drafts` row with `status='proposed'`.
- Operator reviews at /clips Candidates tab and Approves → enqueues `render_f2`.

### /clips page

[src/app/clips/page.tsx](src/app/clips/page.tsx), with three tabs:

**Inbox** — read-only catalog of `clip_library` rows, sortable by `added_at`, filterable by niche + tags. Each row:
- Thumbnail (extracted by handler at ingest time, stored as `clip-library/{uuid}.thumb.jpg`)
- Auto-generated description + tags
- Source URL + source_platform + source_creator
- Duration
- **Block source** button → opens modal with two radios (`Block r/<subreddit>` / `Block /u/<author>`) + optional reason → POSTs to `/api/clips/block` → inserts an `ingest_blocklist` row.
- **Delete clip** button → soft-delete (sets `added_by='deleted'`, keeps row for audit; Composer queries already filter `added_by != 'deleted'`).

Inbox tab is informational — no per-clip approval needed; auto-ingest already triaged each.

**Candidates** — `compilation_drafts` rows with `status='proposed'`. Each card shows:
- Header preview: `title_template` with `accent_word` highlighted.
- 5 clip cards in chosen order: thumbnail + label + start/end + clip's description for context.
- Music preview: HTML5 audio player.
- Three buttons: **Approve** (status→`approved`, enqueues `render_f2`), **Reject** (status→`rejected`, decisions outcome recorded), **Edit** (drawer: drag-to-reorder, swap any clip from the original candidate pool, edit label inline, regenerate title formula).

**Rendered** — `compilation_drafts.status='rendered'` rows. Inline .mp4 preview. **Approve** → promotes the row to a `your_videos` row (status='rendered', render_artifact_url=this.rendered_path, title/description copied) and enqueues `upload`. **Reject** → status→`failed`, with reason captured.

Nav update: `/lab` | `/clips` | (future `/operations`).

### Manual URL drop

Inbox tab has a single-input field: **"Ingest URL manually"** → POSTs to `/api/clips/ingest-url` → enqueues `clip_ingest` with `added_by='manual'`. Bypasses the discovery cron + Stage-1 triage; goes straight to full analysis.

---

## §5 — YouTube OAuth + analytics sync + /lab/drafts update

### OAuth consent flow

```
operator clicks "Connect YouTube" on /settings/channel (NEW page)
   ↓
GET /api/youtube/oauth/start
   ↓ insert youtube_oauth_state row (state = nanoid(32), channel_id, TTL 10 min)
   ↓ redirect to https://accounts.google.com/o/oauth2/v2/auth?... with:
   ↓   client_id, redirect_uri, response_type=code, access_type=offline, prompt=consent,
   ↓   scope = https://www.googleapis.com/auth/youtube.upload
   ↓           + https://www.googleapis.com/auth/youtube.readonly
   ↓           + https://www.googleapis.com/auth/yt-analytics.readonly,
   ↓   state = the nanoid we just stored
   ↓
operator consents in Google's UI
   ↓ (sees "Google hasn't verified this app" warning — clicks Advanced → Go to <app>; see operator setup below)
   ↓
Google redirects to /api/youtube/oauth/callback?code=...&state=...
   ↓
   1. Look up youtube_oauth_state by state; reject if missing/expired.
   2. Exchange code → access_token + refresh_token via Google token endpoint.
   3. Encrypt refresh_token (AES-256-GCM key version 1).
   4. Update channels.oauth_refresh_token_encrypted with the ciphertext JSON.
   5. Delete the state row.
   6. Redirect to /settings/channel?connected=true with success toast.
```

**Token refresh during upload jobs:** the Sandbox `upload` handler calls `getValidAccessToken(channelId)` which decrypts the refresh token and exchanges for an access token in-memory. Access tokens are never persisted. Refresh tokens only ever cross the wire encrypted-at-rest or via HTTPS to Google.

### Performance Sync rewrite

[src/app/api/cron/performance-sync/route.ts](src/app/api/cron/performance-sync/route.ts) — currently a stub. Plan #4 replaces it (no Sandbox; lightweight Function-level cron, runs daily):

```ts
// For each active channel with oauth_refresh_token_encrypted not null:
//   access_token = await getValidAccessToken(channel.id)
//   for each your_videos row where status='posted'
//     AND posted_at >= now() - interval '14 days':
//     // 1. videos.list
//     stats = await youtube.videos.list({
//       id: external_video_id, part: 'statistics' })
//     // 2. core analytics
//     core = await youtubeAnalytics.reports.query({
//       ids: 'channel==' + channel.external_channel_id,
//       startDate, endDate,
//       metrics: 'estimatedMinutesWatched,averageViewDuration,subscribersGained,impressions,ctrPct',
//       filters: 'video==' + external_video_id })
//     // 3. retention curve
//     retention = await youtubeAnalytics.reports.query({
//       ids: 'channel==' + channel.external_channel_id,
//       startDate, endDate,
//       dimensions: 'elapsedVideoTimeRatio',
//       metrics: 'audienceWatchRatio',
//       filters: 'video==' + external_video_id })
//     // UPSERT — unique on (your_video_id, snapshot_at::date) — one row per video per day
//     await db.upsert(video_analytics, {
//       your_video_id, snapshot_at: now(),
//       views, likes, comments,
//       shares: stats.shares ?? null,
//       avg_view_duration_seconds, ctr_pct,
//       subscribers_gained, impressions, watch_time_seconds,
//       retention_curve_jsonb: retention.rows,
//       raw_payload: { stats, core, retention }
//     })
```

**Window:** 14 days post-publish (env `ANALYTICS_SYNC_WINDOW_DAYS`, default 14). Beyond that, stats stabilize; Plan #5's Analyst reads from `video_analytics` regardless of recency.

**API quota:** ~3 calls per video per day × ~5 videos in the active window per channel ≈ 15 calls/day. YT Data API default quota 10,000 units/day; each call is 1 unit. Quota usage <0.2%. Massive headroom.

### /lab/drafts UI update

Current page shows `your_videos.status='draft'` rows. Plan #4 adds two more states + a three-tab layout:

- **Draft** — pre-render. Existing layout (script preview, voice, visual treatment, Director shot list). New **Render** button → POSTs to `/api/lab/render?draftId=X` → enqueues `render_f1`. After click, status='rendering' shows pending state; sandbox callback flips to `rendered`.
- **Rendered** — post-render, pre-upload. Inline `<video src={render_artifact_url} controls />`. Editable title + description. **Approve & Schedule** button *(default)* → POSTs to `/api/lab/schedule?videoId=X` → status='scheduled', `scheduled_for` defaults to next open slot per channel's posting_schedule (operator can override with an inline date+time picker). **Post now** button *(escape hatch)* → POSTs to `/api/lab/upload?videoId=X` → enqueues `upload` directly. **Reject** button → status='failed', reason captured.
- **Scheduled** — between Approve and upload. Shows scheduled_for + countdown ("posts in 3h 14m"). Cancel button reverts to `rendered`.
- **Posted** — post-upload. Link out to YouTube URL + latest `video_analytics` snapshot summary (views, likes, retention curve sparkline).

Two operator gates per Format 1 video are encoded in the UI flow:
```
draft → [click Render] → rendering → rendered → [click Approve & Schedule]
   → scheduled → (scheduled-uploader fires at scheduled_for) → uploading → posted
```

Same approval discipline for Format 2 (gates live on /clips instead). See §5.5 for the scheduling layer.

---

## §5.5 — Operational scheduling

### Why

Without a scheduling layer, "Approve" means "post right now," which produces clumpy, uneven cadence — every time the operator opens the app, they post the backlog; when they don't open it, nothing ships. The first 30 days of a channel are critical for algorithmic ramp; gaps of 24–72 hours kill momentum.

Plan #4 adds a scheduling layer that turns the Upload gate into "Approve & schedule" by default, with a `/operations` calendar UI for visibility and adjustment. The Analyst (Plan #5) later writes `schedule_recommendations` that can be applied with one click.

### State machine update

```
       draft
         │ operator clicks Render
         ▼
    rendering
         │ render_f1 succeeds
         ▼
    rendered
         │ operator clicks Approve & Schedule (or Post now)
         ▼
    scheduled       — scheduled_for = future timestamp
         │ scheduled-uploader cron picks up when scheduled_for <= now
         ▼
    uploading       — upload job in render_jobs queue
         │ upload handler callback
         ▼
    posted          (or failed, with last_error)
```

The Approve gate now offers two paths:
- **Approve & Schedule** *(default)* — status → `scheduled`, `scheduled_for` defaults to next open slot per `channels.posting_schedule`.
- **Post now** *(escape hatch)* — status → `uploading`, render_jobs upload job enqueued immediately. Same as today's behavior.

Format 2 (`compilation_drafts`) gets the same scheduling layer. On Approve at /clips Rendered tab, the row is promoted to a `your_videos` row in `status='scheduled'` (instead of enqueuing upload directly).

### `scheduled-uploader` cron

[src/app/api/cron/scheduled-uploader/route.ts](src/app/api/cron/scheduled-uploader/route.ts), runs every 15 minutes:

```
1. Atomic claim:
     with due as (
       select id from your_videos
       where status='scheduled' and scheduled_for <= now()
       order by scheduled_for
       limit $CLAIM_BATCH_SIZE
       for update skip locked
     )
     update your_videos y set status='uploading', updated_at=now()
     from due d where y.id = d.id returning y.*;

2. For each claimed row:
     a. Check channels.max_uploads_per_day: count today's posted+uploading rows for this channel.
        If at cap, REVERT this row's status back to 'scheduled' and push scheduled_for to the
        NEXT valid slot per channels.posting_schedule that isn't already occupied (function:
        nextOpenSlotAfter(channel, since)). Log the deferral as a structured cron_runs row.
     b. Else: enqueue render_jobs row { job_type='upload', payload={your_video_id} }.

3. After all claims processed: for each channel, compute backlog horizon
   = MAX(scheduled_for) - now() across all status='scheduled' rows.
   If horizon > 7 days, insert (or upsert) an operator_alerts row:
     category='schedule_backlog_overflow', severity='warn',
     message='Schedule backlog extends N days into the future.
              Consider temp-increasing max_uploads_per_day OR culling
              older drafts.',
     suggested_actions=[
       { label: 'Increase max_uploads_per_day to <current+2>', action_type: 'patch_channel',
         params: { max_uploads_per_day: <current+2> } },
       { label: 'Cull drafts older than 14 days', action_type: 'bulk_status',
         params: { from: 'scheduled', to: 'failed', older_than_days: 14 } }
     ].
   Operator clicks an action button in /operations banner; the API endpoint
   /api/operator-alerts/resolve handles it. Operator decides — no auto-action.

4. Return.
```

`CLAIM_BATCH_SIZE` default 5 (env: `SCHEDULED_UPLOADER_BATCH_SIZE`). Cap of 5/run × 15 min cron × `max_uploads_per_day` per channel keeps the system from posting a backlog all at once after downtime.

**Backlog recovery semantics:** a row with `scheduled_for` 6 hours in the past still gets picked up — it's "overdue" rather than skipped. The "push to next valid slot" deferral (not "+1 hour") keeps the schedule shape clean — deferred items land on slots that were already going to host a post, not at arbitrary one-hour gaps. The 7-day overflow guardrail catches the case where backlog grows faster than capacity can drain it.

### Default posting schedule

The default `channels.posting_schedule` JSONB:
```json
{
  "weekdays": ["07:30","08:30","18:30","20:00"],
  "weekends": ["11:30","13:30","19:30","21:00"]
}
```

These reflect current (2026) YouTube Shorts best-practice slots: weekday morning commute (~7:30–9am) + evening commute/wind-down (~6:30–9pm), weekend brunch (~11:30am–2pm) + evening (~7:30–10pm). All times are interpreted in the channel's `timezone` (default `America/New_York`).

Operator can override per-channel via /operations or directly via Supabase. Plan #5's Analyst writes `schedule_recommendations` rows after enough data accrues to suggest adjustments.

### Timezone handling

**Library:** `luxon`. Picked over `date-fns-tz` (less ergonomic for "next-occurrence-after" queries) and `@internationalized/date` (newer, smaller ecosystem). Used both server-side (scheduled-uploader cron) and client-side (/operations calendar). One canonical import path: `import { DateTime } from 'luxon'`.

**Storage convention:** `posting_schedule` times are stored as **wall-clock strings in the channel's timezone** (e.g., `"18:00"` for channel with `timezone='America/New_York'`). Slots are NOT pre-materialized into UTC timestamps; they're recomputed on-the-fly by `nextOpenSlotAfter(channel, since)`:
```ts
function nextOpenSlotAfter(channel, since: DateTime): DateTime {
  const tz = channel.timezone;                              // 'America/New_York'
  const sinceLocal = since.setZone(tz);
  for (let dayOffset = 0; dayOffset <= 14; dayOffset++) {
    const day = sinceLocal.plus({ days: dayOffset });
    const isWeekend = day.weekday >= 6;                     // luxon: 6=Sat, 7=Sun
    const slots = channel.posting_schedule[isWeekend ? 'weekends' : 'weekdays'];
    for (const slotStr of slots) {                          // e.g., "18:30"
      const [h, m] = slotStr.split(':').map(Number);
      const slotLocal = day.set({ hour: h, minute: m, second: 0, millisecond: 0 });
      if (!slotLocal.isValid) continue;                     // DST-eliminated time
      if (slotLocal <= sinceLocal) continue;                // past
      if (await slotIsOccupied(channel.id, slotLocal.toUTC())) continue;
      return slotLocal.toUTC();                             // returned as UTC for DB storage
    }
  }
  throw new BacklogOverflowError(channel.id);               // triggers the 7-day alert
}
```

**DST transition behavior (spelled out for the implementation plan):**
- **Spring forward** (e.g., 2026-03-08 in `America/New_York`, when 02:00 jumps to 03:00): any slot that falls in the lost hour (`02:00`–`02:59`) for that specific day is **skipped entirely**. `DateTime.set({hour:2,minute:30})` returns `isValid=false` for that local date; the `if (!slotLocal.isValid) continue;` line handles this transparently. No silent rescheduling — the slot for that day just doesn't exist.
- **Fall back** (e.g., 2026-11-01 in `America/New_York`, when 02:00 occurs twice — first DST, then standard): luxon resolves an ambiguous local time to the **later** (standard-time) occurrence by default. We **do not** post twice in the duplicate hour; if a slot like `01:30` exists in the schedule and falls in the duplicate hour, we post once during the second occurrence (the one further in UTC time). luxon's default `setZone` behavior matches this requirement without extra config.
- **DST changes are tested explicitly** in the implementation plan with unit tests: spring-forward Sunday and fall-back Sunday for the active channel's timezone, asserting that `nextOpenSlotAfter` returns the expected UTC timestamps.

### Auto-schedule algorithm

When the operator clicks **"Auto-schedule next 7 drafts"** on /operations:

```
1. Fetch all your_videos rows where channel_id=X and status='rendered'
   order by created_at asc, limit 7.
2. Fetch the channel's posting_schedule + timezone + max_uploads_per_day.
3. Compute the next 14 days of open slots:
   - For each day, list weekday or weekend slot times.
   - Convert to UTC timestamps using the channel's timezone.
   - Subtract slots already occupied by your_videos.status in
     ('scheduled','uploading','posted') for that channel on that day,
     AND respect max_uploads_per_day per day.
4. Assign the 7 drafts to the first 7 open slots in chronological order.
5. UPDATE each row: status='scheduled', scheduled_for=<assigned slot UTC>.
```

If <7 open slots exist in the next 14 days (because the channel has many already-scheduled posts), schedule only what fits and surface a toast: "Scheduled N of 7 drafts; remaining drafts stay rendered."

### `/operations` page

[src/app/operations/page.tsx](src/app/operations/page.tsx), with three regions:

**Week-view calendar** — 7-column layout (Mon–Sun), each column showing the channel's posting_schedule slots as time blocks. Slot states:
- *Empty slot at scheduled time* — light gray block, click to manually schedule a specific draft into it (dropdown of `status='rendered'` drafts).
- *Filled slot* — colored card showing draft title + thumbnail + format badge (F1/F2). Drag-to-reschedule moves the card to another open slot (PATCHes `scheduled_for`). Click opens a side-panel with full draft preview + Reschedule/Cancel buttons.
- *Posted slot* — grayed-out card linking to YouTube + showing latest analytics snapshot.

Calendar header: channel picker (multi-channel-ready but only one channel exists in v1), week navigator (← prev / next →), **Auto-schedule next 7 drafts** button (described above), **Edit schedule template** button (modal to edit `channels.posting_schedule` JSONB inline).

**Recommendations panel** *(right rail)* — surfaces `schedule_recommendations` rows where `status='pending'`. Each rec shows:
- The Analyst's evidence (e.g., "Your 8pm slot averages 2.3× the views of your 6:30pm slot over 24 videos"; in Plan #4 this panel will be empty since Analyst doesn't exist yet — the UI ships ready).
- Confidence badge.
- **Apply** button — copies `recommended_posting_schedule` into `channels.posting_schedule`, sets the rec row `status='applied'`. (Optionally re-runs auto-schedule to update upcoming slots.)
- **Dismiss** button — `status='dismissed'`.

**Format-mix bar** *(top of page)* — small visual showing current 7-day mix vs target. E.g., "Last 7 days: 73% explainer / 27% compilation • Target: 60% / 40%". Clicking opens the same target-mix modal to edit `channels.target_format_mix` inline.

### Nav update

`/lab` | `/clips` | **`/operations`** (NEW). Three primary nav entries.

### What about Hard Rule #2 (two operator gates)?

Unchanged. The Render gate (at /lab/drafts or /clips) still gates render spend. The Upload gate (now "Approve & Schedule" at the same UIs) still gates posting. Scheduling is a sub-decision within the Upload gate — operator can pick a time or "Post now," but Approve still requires the click. Auto-approve remains out of scope for v1.

### Impact on Plan #5

The Analyst (Plan #5 Loop 4) gets a new output type: when it detects time-of-day patterns in `video_analytics`, it writes `schedule_recommendations` with confidence + evidence. Plan #4 ships the table + UI; Plan #5 ships the writer. This is the "applied with one click" capability the operator requested.

The Analyst's existing `agent_guidance` flow continues to handle per-agent textual guidance (Strategist/Writer/etc.); `schedule_recommendations` is a separate, more structured stream because the recommendation is a config patch, not natural-language advice.

### Per-day cost impact

Scheduled-uploader cron: ~96 invocations/day, each <100ms wall-clock, no Sandbox spend, ~$0/month. The scheduling layer is operationally free.



### Per-video costs

| Component | Format 1 (60s explainer) | Format 2 (30s compilation) |
|---|---|---|
| Sandbox compute | ~$0.02 (2 vCPU, 4 GB, ~90s) | ~$0.01 (2 vCPU, 4 GB, ~45s) |
| Cartesia TTS | ~$0.015 (per minute of audio) | $0 |
| Pexels b-roll | Free tier | $0 |
| Groq Whisper (caption alignment) | Free tier | $0 |
| Claude calls (Strategist + Writer + VC + Director or Composer) | ~$0.015 | ~$0.01 |
| YouTube upload API | $0 | $0 |
| **Total per video** | **~$0.05** | **~$0.02** |

### Per-clip ingest costs

- Stage 1 (Haiku scoring per Reddit post): ~$0.001 each.
- Stage 2 (full /watch + tag + description on score>60): ~$0.30–0.70 each.
- At cap of 10 full ingests/day: **~$3–7/day**, ~**$100–200/month**.

### Total Plan #4 ops cost projection

At 100 renders/month + 10 ingests/day:
- Render compute + API costs: ~$5/month
- Clip ingest: ~$100–200/month
- YouTube quota: free
- Vercel Blob storage (estimated 2 GB at $0.15/GB-month): ~$0.30/month
- Cartesia + Pexels + Groq: free tiers cover
- Scheduled-uploader + render-watchdog + render-dispatcher crons: ~$0 (lightweight Functions; well within free invocations allotment)
- **Total projection: $120–250/month.**

### Sandbox limits

| | Hobby | Pro |
|---|---|---|
| Max runtime per Sandbox | 45 min | 5 hours |
| Max vCPUs | 4 | 8 |
| Max RAM | 8 GB | 16 GB |
| Concurrent Sandboxes | 10 | 2000 |
| Disk | 32 GB | 32 GB |

Render budgets (target): F1 ~60–120s, F2 ~30–60s. Both fit Hobby's 45-min cap with >10× headroom. Plan #4 ships on Hobby; upgrade to Pro only if the 5-vCPU-hr/month free allotment is exhausted (~2000 renders/month).

### Swap-out path to local PC

`RenderWorker` interface lives in [src/lib/render/workers/types.ts](src/lib/render/workers/types.ts):
```ts
export interface RenderWorker {
  dispatch(job: RenderJob): Promise<{ invocationId: string }>;
  // future hooks for cancellation / status query
}
```

Plan #4 ships one implementation: `src/lib/render/workers/vercel-sandbox.ts`. The dispatcher cron reads `RENDER_WORKER` env var (default `'vercel_sandbox'`) and instantiates the matching worker.

To swap to local PC later (deferred to v2 or v1.5):
1. Add `src/lib/render/workers/local-pc.ts` — uses a long-poll endpoint `/api/render/claim` (with bearer-token auth) instead of `Sandbox.create`. The PC runs a Node CLI that long-polls, runs ffmpeg locally, POSTs results to the same `/api/render/complete` endpoint.
2. Flip `RENDER_WORKER=local_pc` in Vercel env.

**What changes:** one new worker file + one CLI on the operator's PC + one env var. **What stays the same:** all schema, all Claude agents, the queue + FSM + watchdog, /clips and /lab/drafts UIs, ffmpeg commands themselves (just where they execute differs).

**Implementation discipline (enforced via code review):** no `@vercel/sandbox` import outside `src/lib/render/workers/vercel-sandbox.ts` and `scripts/render-worker/`. All other code talks to `RenderWorker` only.

---

## §7 — Phase 1 acceptance gate

**Cannot proceed past Phase 1 (foundation: schema migrations + dispatcher + watchdog + one end-to-end render_f1 happy path) until:**

- One end-to-end `render_f1` job is measured: total wall-clock from dispatcher claim to `/api/render/complete` callback ≤ **240 seconds**. Wall-clock includes Sandbox cold-start, `npm ci` of worker package, Cartesia TTS, Pexels download, ffmpeg encode, Blob upload.
- If exceeded: implementation pauses for a "pre-baked Sandbox image" discussion before Phase 2. Options at that point: pre-bake an image with deps pre-installed (smaller npm ci surface), reduce worker package's dep footprint, or accept the latency and adjust the watchdog timeout.

---

## §8 — Operator setup checklist (consolidated)

One-time setup work the operator owns:

**Before Phase 1:**
- [ ] Provide the **YouTube channel ID** for dyfrx_9754 (visible at studio.youtube.com → Settings → Channel → Advanced settings — the `UCxxxxxxxxxxxxxx` string).
- [ ] Confirm or amend the proposed `cars` niche subreddit list (default: `IdiotsInCars`, `JustRolledIntoTheShop`, `Cartalk`, `cars`, `RoastMyCar`, `spotted`, `formuladank`, `carporn`).
- [ ] Confirm or amend the default **posting schedule** (weekdays `07:30, 08:30, 18:30, 20:00` ET + weekends `11:30, 13:30, 19:30, 21:00` ET) and **target format mix** (60% explainer / 40% compilation). Both editable later from /operations, but the Phase 1 reseed migration writes initial values.
- [ ] Create a **Google Cloud project** at console.cloud.google.com (free).
- [ ] Enable two APIs in the project: **YouTube Data API v3** + **YouTube Analytics API**.
- [ ] Configure OAuth consent screen as **External**, app status "Production" (but only your own Google account in test users for now — formal Google app verification is deferred to a SaaS-productization plan).
- [ ] Create OAuth 2.0 Client ID credentials, type **Web application**, with redirect URIs:
  - Prod: `https://shorts-os-roan.vercel.app/api/youtube/oauth/callback`
  - Local dev: `http://localhost:3000/api/youtube/oauth/callback`

**Vercel env vars to add (Phase 1):**
- `CARTESIA_API_KEY`
- `PEXELS_API_KEY`
- `GROQ_API_KEY`
- `VERCEL_BLOB_READ_WRITE_TOKEN` (auto-set if you provision Vercel Blob via the marketplace)
- `RENDER_CALLBACK_SECRET` (generate via `openssl rand -hex 32`)
- `OAUTH_TOKEN_ENCRYPTION_KEY_V1` (`openssl rand -hex 32`)
- `OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION=1`
- `RENDER_CONCURRENCY=4`
- `REDDIT_INGEST_CADENCE_MINUTES=30`
- `STAGE_1_SCORE_THRESHOLD=60`
- `ANALYTICS_SYNC_WINDOW_DAYS=14`
- `SCHEDULED_UPLOADER_BATCH_SIZE=5`
- `FORMAT_MIX_TOLERANCE_PCT=10`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `RENDER_CALLBACK_BASE_URL=https://shorts-os-roan.vercel.app`
- `RENDER_WORKER=vercel_sandbox`

**OAuth consent caveat:**
- During the first OAuth consent click at `/settings/channel`, Google shows the warning **"Google hasn't verified this app"**. For v1 personal-use this is expected — click **Advanced → Go to shorts-os-roan.vercel.app (unsafe)** and consent. Formal Google verification (privacy policy URL, demo video, 2–6 week review process) is deferred to a SaaS-productization plan; it isn't needed while the operator is the only consenting user.

**Phase 3 setup (after the render pipeline is happy-path-working):**
- [ ] Download **20–50 tracks** from studio.youtube.com → Audio Library, filter to **non-attribution-required** ("Audio Library" → filter `Attribution: Not required`). Drag the MP3s into `/Users/darius/Downloads/shorts-os/music-import/` on the operator's machine.
- [ ] Run `npm run import:music-library` (Plan #4 ships this CLI). It uploads each track to Vercel Blob, calls Claude Haiku to tag genre + energy_level + verify the attribution flag, and inserts `music_tracks` rows. Takes ~5 minutes.

**Recurring:**
- [ ] No regular maintenance. Operator reviews drafts at `/lab/drafts` and candidates at `/clips`. That's the only ongoing operator-time investment.

**Render still runs on Vercel Sandbox, not the operator's PC.** The operator's PC is dev/control surface only.

---

## §9 — Plan #5 dependencies (must be true after Plan #4 ships)

Plan #5 reads from these; Plan #4 must produce them:

1. ✅ `your_videos.posted_at`, `external_video_id`, `url`, `status='posted'` populated by the `upload` handler.
2. ✅ `video_analytics` table exists (renamed from `your_videos_analytics_snapshots`, extended with retention_curve/raw_payload/etc.) and is populated daily by the rewritten performance-sync cron.
3. ✅ `channels.external_channel_id` populated for the active channel (set during the Phase 1 reseed; joined by Plan #5's Analyst).
4. ✅ Performance-sync cron no longer a stub.
5. ✅ `decisions.prompt_version` and `decisions.guidance_ids_used` columns exist and are populated by every Claude-call agent (Strategist, Writer, Voice Coach, Director, Composer).
6. ✅ Strategist output includes `analyst_guidance_acknowledged: false` (always false in Plan #4; field exists for Plan #5).
7. ✅ **`schedule_recommendations` table** exists with operator-applyable structure: `channel_id`, `analyst_run_id` (nullable in Plan #4), `recommended_posting_schedule jsonb` (same shape as `channels.posting_schedule`), `recommended_format_mix jsonb` (same shape as `channels.target_format_mix`), `evidence jsonb` (`{videos: uuid[], stat: {...}}`), `confidence` enum (`low|medium|high`), `status` enum (`pending|applied|dismissed|superseded`), `applied_at`, `dismissed_at`. Plan #5's Analyst writes rows. The /operations Recommendations panel ships in Plan #4 with the **Apply** button wired: one click copies `recommended_posting_schedule` into `channels.posting_schedule` (and/or `recommended_format_mix` into `channels.target_format_mix`) + flips `status='applied'` + sets `applied_at=now()`. **Dismiss** flips `status='dismissed'` + `dismissed_at`. No Analyst writes happen in Plan #4 itself; the table sits empty until Plan #5 starts populating it.

8. ✅ **Time-of-day correlation enabled.** `your_videos.posted_hour_local int (0–23)` + `your_videos.posted_dow_local int (0=Sun..6=Sat)` columns added in §1. Populated by the upload-callback handler at posting time from `posted_at` + `channels.timezone` via luxon (`DateTime.fromJSDate(postedAt).setZone(channel.timezone).hour` and `.weekday`). Immutable after that write. Indexed via `your_videos_time_of_day_idx (channel_id, posted_dow_local, posted_hour_local) where status='posted'`. Plan #5 Analyst's standard time-of-day-vs-retention query pattern:
   ```sql
   select yv.posted_dow_local, yv.posted_hour_local,
          avg(va.avg_view_duration_seconds) as avg_retention,
          avg(va.views)                     as avg_views,
          count(*)                          as n_videos
   from your_videos yv
   join lateral (
     select * from video_analytics
     where your_video_id = yv.id
     order by snapshot_at desc limit 1
   ) va on true
   where yv.channel_id = $1 and yv.status = 'posted'
   group by 1, 2
   having count(*) >= 3
   order by 1, 2;
   ```
   This is a fast index scan; no runtime timezone math needed at query time. The Analyst (Plan #5) joins this aggregate with the recent posting_schedule to compute "your 8pm slot averages 2.3× retention vs. 6:30pm" type observations and writes them as `schedule_recommendations`.

9. ✅ **`operator_alerts` table** exists with `category` enum that includes `'analyst_recommendation'`. Plan #5's Analyst can write info-level alerts ("strong evidence that thumbnail color X correlates with +18% retention") into this table for surfacing in /operations. The /operations banner UI ships in Plan #4 and reads unresolved alerts regardless of writer.

10. ✅ **`channels.posting_schedule`, `channels.target_format_mix`, `channels.timezone`** exist and are populated for the active channel (defaults set in Phase 1 reseed migration).

---

## §10 — Explicit non-goals (deferred to later plans)

**Note on Remotion features:** the 5 remaining Remotion feature categories (transitions, callouts, lower-thirds, title cards, intros/outros) are **NOT deferred** — they are integrated into Phases 3–5 per the §4 Remotion Feature Integration Map. Do not list them here.

- **Format 3 (streamer phonk edit).** Spec exists; not implemented. Deferred for IP/licensing reasons and operator priority.
- **Multi-channel support.** Schema already supports it; orchestrator + crons assume one active channel. Multi-channel routing (the "tool decides what to do with a new channel" goal in the operator's brief) is a later plan.
- **Auto-approve / autonomous posting.** Two operator gates mandatory in v1.
- **YouTube + TikTok clip-ingest sources.** Reddit-only for v1. The existing scrapers (`youtube-trending`, `tiktok-trending`) keep populating `viral_observations` for the Strategist; they don't feed `clip_library` in v1.
- **Per-niche tunable ingest cadence.** One global env var for now.
- **Formal Google app verification.** Personal-use mode in v1.
- **Color-grade-per-video / structural Format-2 variation beyond layout_variant.** Plan #4 ships `top5_sidebar` ↔ `top5_overlay`. Further variation deferred.
- **Operator-talking-head intro clips for Format 2.** Big lift, deferred.
- **Attribution-required music tracks.** Excluded by Composer's WHERE clause until v1.5 description-builder ships.
- **Pre-baked Sandbox image / custom container.** Plan #4 uses base node22 + `npm ci`. Pre-baked images are an escape hatch *only* if Phase 1 benchmark fails ≤240s.
- **Cost-cap circuit breakers.** Operator monitors via the cron_runs log (which Plan #4 ships) but no automatic kill switches in v1.

---

## §11 — Open questions for the implementation plan (not the spec)

These are deliberately left for Plan #4's implementation plan to resolve (not blockers on the spec):

1. **Exact Cartesia voice IDs to seed** in the cars-channel persona (Voice Coach picks from VOICE_POOL; need a default `default_voice_id`).
2. **Exact Director prompt template wording** for `held_shot_with_text_animation` ("use when…" guidance).
3. **Exact Composer prompt template wording** for the variation enforcement.
4. **Exact Reddit Stage-1 scoring prompt** (what makes a "60+ score" car-clip post).
5. **Width of the `cars` persona JSONB** — voice, tone, forbidden topics, signature visual elements.
6. **Exact ffmpeg filter graphs** for both render handlers (filter graphs are easiest to iterate during implementation rather than spec).
7. **Whether Whisper forced-alignment for Format 1 captions uses `whisper.cpp` in the Sandbox or stays on Groq** (latency vs. cost tradeoff measurable in Phase 1 benchmark).
8. **Exact IANA timezone library** for the scheduled-uploader (`Intl.DateTimeFormat` + manual offset math vs. `luxon` vs. `date-fns-tz`). Implementation plan picks based on Sandbox bundle size.
9. **Default `cars`-channel posting schedule** — defaults are pulled from general YT Shorts best practices; the implementation plan should sanity-check against any cars-niche-specific posting-time research before locking the seed.

---

## §12 — Risks / open caveats

- **Reddit content provenance.** Reddit posts are user-uploaded; many are themselves re-uploads of TikTok/Instagram content with unclear original rights. `clip_library.source_creator` records the Reddit poster but is not a legal defense. Operator owns the sourcing-strategy risk per the clip-formats spec's legal note. Plan #4 does not make this riskier; it just productizes what the operator's already chosen.
- **YouTube "Reused Content" policy.** Mitigated via the 5-dimensional Composer variation strategy + occasional layout-break, but not eliminated. Watch for demonetization signals in Plan #5's Analyst output once posting starts.
- **Stage-1 score threshold needs tuning.** Default 60 is a guess; the `ingest_skip_log` table exists specifically so the operator can audit Stage-1 rejections after the first ~50 candidates and adjust.
- **Sandbox cold-start latency.** Phase 1 benchmark catches this. If `npm ci` per cold-start is too slow, pre-baked image discussion is on the table.
- **YouTube OAuth token revocation.** If the operator revokes the app's access in their Google account, the next `upload` job fails. Implementation plan should make this visible (status='failed', `last_error` mentions OAuth) and a small UI message at /settings/channel prompts reconnect.
- **Cost overrun.** No automatic circuit breaker in v1. At sustained 10 ingests/day for 30 days the bill is ~$200; an unmonitored runaway (e.g. discovery cron infinite loop) could 10× that. Implementation plan adds a daily cost-summary log row to `cron_runs` so the operator notices early.
- **Scheduled-uploader backlog after downtime.** If the cron is offline for hours (Vercel incident, Supabase outage), `scheduled` rows pile up. The `CLAIM_BATCH_SIZE=5` + `max_uploads_per_day` deferral logic in §5.5 prevents a flood-on-recovery, but the operator may see videos posting late. Acceptable for v1; future improvement could include a "burst-pause" mode the operator triggers from /operations.
- **Format-mix override during cold start.** Strategist's mix enforcement skips when `total_videos < 5` in the 7-day window. After video #5, a sudden hard constraint could feel jarring (e.g., Strategist wanted explainer five times in a row, suddenly forced to pick compilation). Documented in /operations format-mix bar so the operator sees what's happening.
- **Timezone DST edges.** `channels.posting_schedule` is interpreted in `channels.timezone` (default `America/New_York`). On DST transition days, the cron's "next scheduled slot" calculation uses the IANA library to handle the spring-forward / fall-back correctly. Tested explicitly in the implementation plan.

---

## §13 — References

- [Master design](./2026-05-24-shorts-os-design.md) — original Plan #4 scope (now superseded by this doc)
- [The Lab design (Plan #3)](./2026-05-24-shorts-os-the-lab-design.md) — defines the agents this pipeline consumes
- [Clip-formats design](./2026-05-25-shorts-os-clip-formats-design.md) — three formats; this spec implements two
- [Plan #5 design](./2026-05-25-shorts-os-plan-5-learning-loops-design.md) — its §"Dependencies on Plan #4" is fully baked in here
- [/watch skill integration](./2026-05-25-watch-skill-integration.md) — used by `clip_ingest` handler
- Vercel Sandbox docs: [pricing](https://vercel.com/docs/vercel-sandbox/pricing), [SDK reference](https://vercel.com/docs/vercel-sandbox/sdk-reference)
- Current orchestrator (to be branched): [src/lib/agents/orchestrator.ts:38](src/lib/agents/orchestrator.ts:38)
- Current performance-sync stub (to be replaced): [src/app/api/cron/performance-sync/route.ts](src/app/api/cron/performance-sync/route.ts)
- Current schema baseline: `supabase/migrations/20260524*` and `20260525*` files

---

## Note for the implementation-plan author

This codebase is **Next.js 16 with breaking changes from earlier versions** (per [AGENTS.md](../../AGENTS.md)). Before writing any route handler or page code, the implementation plan must include a step that reads `node_modules/next/dist/docs/` for the relevant API. Do not write from training-data memory of Next.js conventions.
