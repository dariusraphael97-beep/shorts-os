# Shorts OS — Plan #5: Learning Loops + The Analyst Design

**Status:** Design draft. No implementation yet. Plan #4 must ship before any of this becomes useful (need posted videos with analytics flowing in).

**Author:** Claude (chat session 2026-05-25), via Darius.

**Predecessors referenced:**
- [Shorts OS master design](./2026-05-24-shorts-os-design.md) — section 6 ("The Learning Loop") is the source of this spec
- [The Lab design (Plan #3)](./2026-05-24-shorts-os-the-lab-design.md) — defines the 4 production agents this plan enriches
- [Clip Formats design](./2026-05-25-shorts-os-clip-formats-design.md) — adds 3 more agents (Clip Selector, Layout Renderer, Edit Director) that this plan also has to enrich

---

## TL;DR

Plan #5 ships the piece of Shorts OS that makes it actually get better over time — without it, the tool is a really good *generic* AI content generator. With it, the tool is tuned to the operator's specific channel(s) and what's empirically working for them.

The centerpiece is a **5th agent called The Analyst**. It runs on a cron (not in the production hot path), reads what the production agents decided + how the resulting videos performed, finds patterns, and writes structured guidance back to the other agents via the existing `agent_messages` table. On their next production run, each production agent's prompt template includes a "recent guidance from The Analyst" block that biases their decisions.

That's the "communication" the operator asked for: not turn-by-turn chat during a single Short, but a between-runs feedback channel that compounds.

Plan #5 also ships the data plumbing needed for The Analyst to have something to analyze:
- Real (non-stub) Performance Sync that pulls YouTube Analytics daily into a `video_analytics` table
- Niche-level trend tracking (Niche Loop)
- Pattern extraction from viral observations (Pattern Loop, augmented by /watch data when present)
- Per-agent decision-outcome correlation logic

---

## Why this can only ship after Plan #4

Plan #5 needs three upstream things to exist that don't exist today:

1. **Posted videos with real YouTube IDs** — Plan #4 ships render + upload, which gives us `your_videos.external_video_id` and `your_videos.url`
2. **Working YouTube Analytics integration** — Plan #4 must build OAuth + Data API v3 + scheduled analytics pulls. Today `src/app/api/cron/performance-sync/route.ts` is an explicit stub
3. **Volume of posted videos** — statistically, The Analyst can't surface real signal from <30 videos. Plan #4 ships the production pipeline; the operator then has to actually post 30-100+ videos before Plan #5 has data to learn from

This is also why Plan #4's design must include Plan #5's needs:
- `video_analytics` table fields (retention_curve_jsonb, ctr_pct, avg_view_duration_seconds, etc.)
- `your_videos` needs `posted_at`, `external_video_id`, `external_channel_id` to actually be filled in by the upload step
- Every agent's `decisions` row needs enough context that The Analyst can later correlate the decision with the outcome (this is already true for Lab Phase 1, but Format 2/3 agents need to follow the same discipline)

---

## The four loops (architecture overview)

The master design lists four loops. They are interrelated but separable.

### Loop 1 — The Niche Loop (data continuous, report weekly)

**What it does:** tracks aggregate health of each niche the operator is in — total views/24h across the niche, average video length, retention proxy (engagement-per-view from the scrapers), competitor growth.

**Who reads it:** the Strategist, when picking topic angles. Also surfaced in Cockpit as a weekly trend report.

**Built from:** the existing `viral_observations` table (already populated by the scrapers).

**New code needed:** a daily aggregation job that computes niche-level summaries and writes them to a new `niche_health_snapshots` table.

### Loop 1b — The Scout's niche radar (cross-niche, weekly)

**What it does:** scans *beyond* the operator's currently-active niches to surface emerging non-saturated niches the operator could pivot into. Runs weekly. Output is a ranked list of candidate niches with one-line opportunity descriptions ("car-detailing-ASMR has +340% view velocity over 8 weeks, only 11 channels with >100k subs, est CPM tier C — pivot candidate").

**Who reads it:** the operator, via a new Cockpit pane (the "Scout Radar"). NOT consumed by production agents — the operator decides whether to act on a Scout recommendation by manually adding a new niche row + spinning up a new channel.

**Criteria the Scout evaluates per candidate niche:**
- **Engagement velocity** — week-over-week % growth in aggregate views across the niche's top videos
- **Establishment density** — count of channels in the niche with >100k subs, normalized by niche age. Low density = less competition.
- **CPM tier signal** — heuristic mapping from niche keywords to monetization tier (finance/health/B2B = high; gaming/entertainment = medium; reaction/meme = low). Sourced from publicly-known CPM ranges, not from operator's actual analytics.
- **Operator-fit signal** — flag if the candidate niche is adjacent to operator's current niche (e.g., cars → motorcycles → boats) for easier brand-extension narrative.

**Source data:** the existing scrapers (`youtube-trending`, `tiktok-trending`, `reddit-harvest`) are extended to also scrape *uncategorized* trending content (not just operator's configured niches), tagging it with auto-classified niche labels via Claude Haiku. A new `niche_candidates` table stores the cross-niche pool.

**Built from:** extended `viral_observations` (cross-niche pool) + new `niche_candidates` table + Claude Haiku classification.

**New code needed:**
1. Scraper extension to ingest cross-niche trending content
2. Niche-classifier Haiku call
3. `niche_candidates` table + repo
4. Scout's weekly Claude call that ranks candidates and emits Scout Radar output
5. Cockpit Scout Radar pane

**Rationale:** Plan #4's cars-niche choice is intentionally a "build data" decision, not a permanent commitment. Without the Scout's cross-niche radar, the operator only sees their currently-active niche's data — making pivot decisions becomes blind guessing. The Scout's job is to keep the pivot option *informed*. The first concrete output of the Scout (after cars channel ages enough to have its own performance data) tells the operator whether to double-down on cars, pivot to an adjacent niche, or pivot to a high-CPM unrelated niche.

**Cadence:** weekly Claude call. Cost: ~$0.20–0.50 per run depending on candidate pool size. Acceptable.

**Schema addition (preview — full spec when Plan #5 implementation begins):**
```sql
create table public.niche_candidates (
  id uuid primary key default uuid_generate_v4(),
  slug text not null,                          -- auto-derived from classifier output
  display_name text not null,
  description text,
  engagement_velocity_pct numeric,             -- week-over-week growth
  establishment_density int,                   -- channels >100k subs in niche
  cpm_tier text check (cpm_tier in ('A','B','C','D')),  -- A=highest
  adjacency_to_operator_niche text,            -- 'adjacent' | 'unrelated' | 'overlap'
  evidence jsonb not null,                     -- source video ids + sample titles
  first_seen_at timestamptz not null default now(),
  last_scored_at timestamptz,
  unique (slug)
);
```

### Loop 2 — The Pattern Loop (per scraped viral video, continuous)

**What it does:** for every viral Short the scrapers ingest, extract its structural patterns into a `patterns` library. With /watch integration (per the watch-skill-integration spec), this gets dramatically richer — instead of inferring patterns from metadata, the Pattern Loop sees the actual frames and transcript.

**Patterns tracked:** hook structure (question vs statement vs number vs "wait until you see"), hook duration (seconds before first visual or voice change), b-roll cadence (cuts per second), caption style (single word vs phrase vs none), audio type (voiceover only vs voiceover+music vs music only), title format and emoji usage, visual treatment (matches the Director's enum).

**Who reads it:** Writer, Voice Coach, and Director — their prompts get conditioned on "the current top patterns for this niche."

**Built from:** `viral_observations` + (when available) `video_breakdowns` from the /watch integration.

**New code needed:** a Pattern Extractor that reads recent viral observations + breakdowns, asks Claude to categorize them into pattern slots, computes win_rate per pattern (where "win" = top-quartile views in the niche), writes to existing `patterns` and `pattern_performance` tables (both currently empty).

### Loop 3 — The Personal Loop (per posted video, continuous)

**What it does:** correlates each video the operator posts with its eventual performance. After enough volume, surfaces operator-specific patterns ("your channel performs 2x better with male voice + question hooks + 47s videos posted at 6pm EST").

**Who reads it:** all production agents. Personal Loop outputs override Pattern Loop outputs when they conflict — *your* channel's data is stronger signal than the niche's general data.

**Built from:** `your_videos` × `video_analytics` × `decisions`.

**New code needed:** the YouTube Analytics integration (OAuth + Data API + cron) and a Correlator that joins decisions with outcomes.

### Loop 4 — The Agent Loop (The Analyst, per agent, continuous)

**What it does:** wraps Loops 1-3 into structured per-agent guidance and feeds it back into each agent's prompt. This is The Analyst's main job.

**Who reads it:** each production agent reads its own inbox before its next call.

**Built from:** outputs of Loops 1-3 + raw `decisions` table.

**New code needed:** The Analyst agent (Claude call), a `agent_guidance` table (or extending `agent_messages`), and prompt template changes in every production agent.

---

## The Analyst (Loop 4 in detail)

This is what the operator specifically asked for, so it gets the most detail.

### The Analyst is a 5th agent, not a 5th step

Critical distinction: The Analyst does **not** run inside the production pipeline. It does not gate a Short being produced. It runs out-of-band on a separate cron.

```
Production pipeline (synchronous, runs on dispatch):
  Strategist → Writer → Voice Coach → Director → Render → Upload
                                                              │
                                                              ▼
                                                       posted to YT
                                                              │
                                                              ▼ (over hours/days)
                                                       YT Analytics
                                                              │
                                                              ▼ (daily cron)
                                                  Performance Sync → video_analytics
                                                              │
                                                              ▼ (weekly cron or per-N-videos)
                                                       The Analyst (NEW)
                                                              │
                                                              ▼
                                                  agent_guidance + agent_messages
                                                              │
                                                              ▼
                                              next production run reads these
```

### What The Analyst reads

Single Claude call per analysis run. Input bundle:

- All `decisions` rows since last analysis run, joined to their resulting `your_videos.id`
- `video_analytics` rows for those videos (views, retention curve, CTR, avg view duration, sub gain)
- Aggregate niche health from Loop 1
- Top patterns from Loop 2
- Prior `agent_guidance` rows (so The Analyst can see what it told the other agents last time and whether following that guidance helped)

### What The Analyst writes

A structured Zod-validated output that decomposes into:

```typescript
{
  analysis_window_start: timestamp,
  analysis_window_end: timestamp,
  videos_analyzed: number,
  guidance_for_strategist: [
    { observation: string, evidence: { videos: uuid[], stat: ... }, confidence: "low" | "medium" | "high" }
  ],
  guidance_for_writer:    [ ... same shape ],
  guidance_for_voice_coach: [ ... ],
  guidance_for_director:  [ ... ],
  guidance_for_clip_selector: [ ... ],   // Format 2/3 only
  guidance_for_layout_renderer: [ ... ], // Format 2 only
  guidance_for_edit_director: [ ... ],   // Format 3 only
  overall_summary: string,
  open_questions: string[]
}
```

Each guidance item has:
- `observation` — the rule, in natural language ("Question hooks retained 18% better than statement hooks")
- `evidence` — which videos and which stat support it
- `confidence` — Claude's self-rated confidence; gates how much weight downstream agents give it

These get written to a new `agent_guidance` table AND propagated as `agent_messages` rows targeted at each production agent (with `from_agent: 'analyst'`, `intent: 'guidance'`).

### How production agents consume guidance

Each production agent's prompt template gets a new block injected at the top:

```
Recent guidance from The Analyst (analysis window {start}–{end}, {N} videos):

High-confidence observations (apply unless your situation contradicts them):
- {observation 1 with evidence count}
- {observation 2 ...}

Medium-confidence observations (use as tiebreakers):
- {observation 1 ...}

Low-confidence observations (informational only, don't constrain decisions):
- {observation 1 ...}
```

This is **the only change** to the production agents' code: the prompt template gets a new variable injected before each call, populated by querying `agent_guidance` filtered to `to_agent = <agent_id>` and `still_valid = true`. The agent's decision schema doesn't change. The orchestrator doesn't change. Only the prompt template does.

That's deliberate: it keeps the production hot path simple and Plan #5 cleanly separable from Lab/Plan #4. If the guidance turns out to be noisy, we can toggle the injection off without re-deploying agents.

### Guidance lifecycle

Each guidance row has `created_at`, `still_valid`, `superseded_by_id`. The Analyst on each run:
- Marks prior guidance as `still_valid = false` when contradicted by new data
- Sets `superseded_by_id` to the new row that replaced it
- Doesn't delete — keeps the history so we can trace why the system's behavior changed over time

This also gives the operator a "decision log" they can read to understand why the Writer started preferring question hooks last week.

### Cadence and triggers

Options:
- **Weekly cron** — simplest. Runs every Sunday night, analyzes the last 7 days.
- **Per-N-videos trigger** — runs after every 10 posted videos finish their analytics-stabilization window (~7 days post-publish).
- **Both** — weekly baseline + per-N as a fast-cycle option for early data.

Recommended: weekly cron for v1, add per-N trigger later if the cadence feels too slow.

### Statistical guardrails (the small-N problem)

With <30 videos the Analyst will overfit. To mitigate:

1. **Minimum sample size for high-confidence claims** — at least 5 videos supporting an observation before confidence = "high"
2. **Confidence-gated downstream weighting** — production agents are explicitly told in their prompts: "low-confidence observations are informational, don't constrain your decision"
3. **Cross-validation against prior guidance** — if The Analyst's previous "question hooks better" guidance held up across the next 10 videos, raise confidence; if it didn't, lower it
4. **Operator override** — Cockpit UI lets the operator mark guidance as "ignore" so a bad Analyst recommendation doesn't lock in. Adds a `operator_disabled` boolean to `agent_guidance`

The honest expectation: the first 50 posted videos will give noisy guidance. The next 50 will give partially noisy + partially real guidance. By ~150 posted videos the guidance is mostly reliable.

---

## Schema changes

```sql
-- Loop 1: niche-level trend snapshots, daily
create table public.niche_health_snapshots (
  id uuid primary key default uuid_generate_v4(),
  niche_id uuid not null references public.niches(id) on delete cascade,
  snapshot_date date not null,
  total_views_24h bigint,
  videos_observed_24h int,
  avg_duration_seconds numeric,
  median_views numeric,
  p95_views numeric,
  top_creators_24h jsonb,                    -- [{channel_name, total_views}]
  notable_outliers jsonb,                    -- [{observation_id, view_velocity}]
  computed_at timestamptz not null default now(),
  unique (niche_id, snapshot_date)
);

create index niche_health_niche_date_idx on public.niche_health_snapshots (niche_id, snapshot_date desc);

-- Loop 3: per-posted-video analytics, daily refresh
create table public.video_analytics (
  id uuid primary key default uuid_generate_v4(),
  your_video_id uuid not null references public.your_videos(id) on delete cascade,
  snapshot_at timestamptz not null default now(),
  views bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  subscribers_gained int,
  avg_view_duration_seconds numeric,
  retention_curve_jsonb jsonb,               -- [{percent: 0.1, viewers_remaining_pct: 92}, ...]
  ctr_pct numeric,
  impressions bigint,
  watch_time_seconds bigint,
  raw_payload jsonb,                         -- entire YT Analytics API response
  unique (your_video_id, snapshot_at)
);

create index video_analytics_video_idx on public.video_analytics (your_video_id, snapshot_at desc);

-- Loop 4: The Analyst's guidance to other agents
create table public.agent_guidance (
  id uuid primary key default uuid_generate_v4(),
  analyst_run_id uuid not null,              -- groups all guidance from one Analyst run
  to_agent text not null check (to_agent in (
    'strategist', 'writer', 'voice_coach', 'director',
    'clip_selector', 'layout_renderer', 'edit_director'
  )),
  observation text not null,
  evidence jsonb not null,                   -- { videos: uuid[], stat: { ... } }
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  still_valid boolean not null default true,
  superseded_by_id uuid references public.agent_guidance(id),
  operator_disabled boolean not null default false,
  created_at timestamptz not null default now()
);

create index agent_guidance_to_agent_active_idx on public.agent_guidance (to_agent) where still_valid and not operator_disabled;
create index agent_guidance_run_idx on public.agent_guidance (analyst_run_id);

-- The Analyst's run log (for traceability)
create table public.analyst_runs (
  id uuid primary key default uuid_generate_v4(),
  window_start timestamptz not null,
  window_end timestamptz not null,
  videos_analyzed int not null,
  overall_summary text,
  open_questions jsonb,
  duration_ms int,
  cost_usd numeric,
  created_at timestamptz not null default now()
);
```

The existing `patterns` and `pattern_performance` tables stay as designed — they're populated by Loop 2.

---

## How each existing agent's prompt template changes

Same change, repeated for each production agent:

**Before (current Lab Phase 1 code):**
```typescript
function buildPrompt(ctx: WriterRunContext): string {
  return `You are The Writer. Produce a 45–60 second faceless YouTube Short script.
  ...`;
}
```

**After (Plan #5):**
```typescript
function buildPrompt(ctx: WriterRunContext, guidance: AgentGuidance[]): string {
  const guidanceBlock = formatGuidance(guidance);  // groups by confidence tier
  return `You are The Writer. Produce a 45–60 second faceless YouTube Short script.

${guidanceBlock}

[rest of prompt unchanged]
...`;
}
```

The orchestrator becomes responsible for querying `agent_guidance` filtered to each agent before calling that agent. One new repository function `getActiveGuidance(supabase, agent: AgentId): Promise<AgentGuidance[]>`. That's the entire production-side change.

---

## Build order within Plan #5

Once Plan #4 ships, Plan #5 builds in this order:

1. **YouTube Analytics integration.** Replace the stub at `src/app/api/cron/performance-sync/route.ts`. OAuth + Data API v3 + daily pull → `video_analytics`. This is foundational; nothing else in Plan #5 works without it.
2. **`video_analytics` populated for at least 30 videos.** Wait — this isn't code, it's operator-time. The operator has to actually post 30+ videos and let them age 7+ days for analytics to stabilize.
3. **Loop 1 (Niche Loop) — niche_health_snapshots cron.** Simple aggregation. Easy first build to validate the cron + cockpit-display path.
4. **Loop 2 (Pattern Loop) — Pattern Extractor.** Read viral_observations (+ video_breakdowns if /watch integration shipped), write to patterns + pattern_performance.
5. **The Analyst agent** — the Claude call + the schema for agent_guidance. Initial version writes guidance but production agents don't yet consume it.
6. **Production-side prompt template changes.** Add the guidance injection to each production agent. Toggle behind a feature flag initially so we can A/B "with guidance" vs "without."
7. **Cockpit Analyst pane.** UI surface so the operator can see what The Analyst observed, mark guidance as operator-disabled, and trace why agents are making the choices they are.

Steps 1-5 are pure backend work, no UI. Step 6 affects every production agent in a small way. Step 7 is operator-facing.

---

## Decision points / open questions

1. **Per-agent vs. per-channel guidance.** Should The Analyst write one universal guidance set or one set per channel? Multi-channel operators (eventually) need per-channel. v1 is single-channel so universal is fine. Schema already supports per-channel via the videos→channel join in evidence, but `agent_guidance` doesn't have a channel_id column yet.

2. **Confidence threshold for the prompt block.** Should low-confidence guidance be shown to agents at all? Recommended: include with explicit "informational only" framing. Lets agents factor it as a tiebreaker. Risk: agents over-weight it.

3. **Analyst-of-the-Analyst.** Do we ever evaluate whether The Analyst's guidance actually improved outcomes? Yes — Loop 4 has a meta-step: each guidance row's prediction can be checked against subsequent videos. If guidance was followed and outcomes improved, raise confidence in similar future observations. This is a Plan #5.5 feature, not v1.

4. **Cost ceiling for The Analyst.** Claude calls with full input bundle (decisions + analytics for 30+ videos + retention curves) are large prompts. Estimated per-run cost: ~$0.10-0.50 depending on Sonnet vs Haiku. Weekly cron = $5-25/month. Cap with `max_videos_per_run` parameter; if the window has more, Analyst processes top-N by impact.

5. **Cross-format learning.** When Format 2/3 ship (Top-5 compilation, streamer edits), can The Analyst's findings transfer across formats? E.g., does "question hooks outperform statement hooks" learned on Format 1 explainers apply to Format 2 Top-5 captions? Probably not directly. Plan: The Analyst maintains per-format guidance and only transfers across formats when explicit evidence supports it.

6. **What does The Analyst do for niches with no posted-video data?** Falls back to Loop 2 (Pattern Loop) — global patterns from scraped viral observations. Has to flag confidence accordingly. Operator's first 30 videos in a new niche → all medium/low confidence guidance, mostly from external patterns.

7. **Schema split: extending `agent_messages` vs. new `agent_guidance`.** The existing `agent_messages` table is designed for in-pipeline communication (Strategist→Writer→VC→Director, per Lab Phase 1). The Analyst's output is between-runs guidance, different lifecycle (versioned, supersedable, operator-disable-able). Separate table is cleaner. Could re-use `agent_messages` with new `intent: 'guidance'` but the lifecycle fields don't fit.

---

## Risks / caveats

- **Statistical bullshit risk.** Claude is confident even with bad sample sizes. Confidence levels + minimum-N gates are mitigations but not cures. Operator should treat first-100-video guidance as suggestive, not authoritative.
- **Confirmation bias.** If The Analyst tells the Writer "question hooks work" and the Writer biases toward them, the next batch is mostly question hooks → no comparison data → guidance is self-reinforcing. Mitigation: enforce a minimum % of "exploration" decisions (e.g., 20% of Writer's hooks should defy current guidance, just to keep the comparison set alive).
- **Latency between decision and outcome.** A video's analytics take 7+ days to stabilize. Guidance is always 1-2 weeks behind. For weekly cadence this is fine; if we push to per-N triggering, we need to wait for analytics stabilization per video.
- **YouTube API quota.** Analytics API has daily quotas (~10K queries default). With 100+ posted videos and daily pulls, this is fine. With 1000+ it becomes a constraint — need to batch / sample.
- **Operator may not post enough.** The biggest risk to Plan #5 paying off is the operator stopping posting before reaching the volume threshold (~100 videos) where guidance becomes reliable. This is outside the tool's control.

---

## Dependencies on Plan #4 (must be baked into Plan #4 design)

Plan #4 needs to make sure these are true before Plan #5 can do anything:

1. **`your_videos.posted_at`, `external_video_id`, `external_channel_id` are actually filled in** by the upload step (not just left null)
2. **`video_analytics` schema exists** (we add it in Plan #5 but the table can also be added during Plan #4 since the upload step needs to know where to write to)
3. **YouTube OAuth flow works** — operator has authorized the app to read Analytics for their channel(s). This is Plan #4 work.
4. **Performance Sync cron is no longer a stub** — Plan #4 ships the real implementation that writes to `video_analytics`
5. **Decision logging discipline** — all production agents in Plan #4's expanded agent roster (Clip Selector, Layout Renderer, Edit Director) must write `decisions` rows with enough context for later correlation. Same standard as Lab Phase 1.

Plan #4's design doc should include these requirements explicitly.

---

## Cockpit UI surface (Step 7)

Out of scope for this design but worth noting what the operator interacts with:

- **The Analyst pane** in Cockpit — sidebar shows recent observations, by confidence tier
- **Per-agent guidance view** — click an agent (Strategist/Writer/etc.), see what guidance is currently active for them
- **Operator override** — toggle individual guidance items as "ignore"
- **Decision trace** — click a recent posted video, see which guidance was active when each of its agents made their decisions

This UI work is small once the backend is built. Probably 2-3 days.

---

## What this design does NOT include

Per the master design (line 396): explicit non-goals for v1 learning loop:

- ❌ True ML / RL or model fine-tuning. Everything is via prompt enrichment.
- ❌ Cross-user pattern sharing. Single operator.
- ❌ Auto-decision making. Operator stays in approval loop for posted videos.

These are right. Don't expand scope here.

---

## What this design changes about Plan #4's design

(Pull these forward into the Plan #4 implementation plan when it gets written.)

1. The Strategist's output already needs `selected_format` (per the clip-formats spec); also add `analyst_guidance_acknowledged: boolean` so we can later check if a decision was made with or without guidance present.
2. Every production agent's `decisions` row should include `prompt_version` and `guidance_ids_used` (uuid[]) so The Analyst can later isolate which decisions were guidance-influenced.
3. The upload step must fill in `your_videos.posted_at` and `external_video_id` — both must be NOT NULL after upload completes.
4. `video_analytics` table can be created during Plan #4 (rather than waiting for Plan #5) since Plan #4 already touches the upload + analytics path.
5. The stubbed performance-sync cron at `src/app/api/cron/performance-sync/route.ts` needs to be removed-stub-and-build-for-real in Plan #4. Plan #5 then adds Niche/Pattern/Analyst layers on top of the data Plan #4's sync produces.

---

## References

- Master design, section 6 (the source of this spec): `docs/superpowers/specs/2026-05-24-shorts-os-design.md`
- The Lab design (defines the 4 production agents): `docs/superpowers/specs/2026-05-24-shorts-os-the-lab-design.md`
- Clip formats design (defines the 3 additional agents in Format 2/3): `docs/superpowers/specs/2026-05-25-shorts-os-clip-formats-design.md`
- /watch integration (richer Pattern Loop inputs): `docs/superpowers/specs/2026-05-25-watch-skill-integration.md`
- Current performance-sync stub: `src/app/api/cron/performance-sync/route.ts`
- Existing tables this plan reads/writes: `viral_observations`, `your_videos`, `decisions`, `agent_messages`, `patterns`, `pattern_performance`, `channels`, `niches`
- Existing tables this plan adds: `niche_health_snapshots`, `video_analytics`, `agent_guidance`, `analyst_runs`
