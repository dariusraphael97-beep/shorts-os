# Plan #5 Phase 1 Sub-phase C — Multi-source ingestion — Design Spec

**Date:** 2026-05-28
**Status:** Approved by Darius (brainstorm); pending writing-plans for task breakdown.
**Branch target:** `plan-5-phase-1-sub-c` off `main`; PR against `main`.
**Parent spec:** `docs/superpowers/specs/2026-05-28-plan-5-creator-copilot-design.md` (§4.2 Multi-source ingestion, §4.5 Watch-list, §4.12 ingestion-health). This document narrows Phase 1 §4.2 + §4.5 to the executable Sub-phase C scope.

This is the first sub-phase that adds **crons + API routes**. Sub-phase A shipped the schema + repository helpers; Sub-phase B shipped the design system. Sub-phase C produces the **raw signal** the rest of Phase 1 consumes.

---

## 1. Scope

### In scope (this sub-phase)

Daily/6-hourly ingestion that writes **raw rows** into the Sub-phase A schema:

- **YouTube category sweep** — `videos.list?chart=mostPopular` across 12 categories, ≤60s filter → `shorts_observations` (`source='youtube_most_popular'`).
- **YouTube targeted Shorts search** — `search.list` over rotating broad seeds → `shorts_observations` (`source='youtube_search'`).
- **Watch-list sync** — for active `watched_channels`: velocity snapshots → `video_velocity_snapshots`; channel-stat enrichment (subs/title/thumb/growth/outlier-rate) → `watched_channels`; §4.5 auto-discovery (auto-add outlier/breakout channels) + 90-day eviction. Observed watch-list videos also land in `shorts_observations` (`source='youtube_watch_list'`).
- **Reddit topic-discovery** — free public JSON API over ~30 seed subreddits → `shorts_observations` (`source='reddit_topic'`, synthetic IDs).
- **Google Trends** — rising-search signal via `google-trends-api` → `shorts_observations` (`source='google_trends'`, synthetic IDs).
- **TikTok Creative Center** — **stub adapter, disabled** (Vercel crons can't drive Chrome MCP). Ships a clean disabled run; real ingest slots in later without reshaping the pipeline.
- **`ingestion_runs` health table** (new additive migration) + repository, wrapping every cron so Sub-phase D's `/admin/ingestion-health` has data immediately.
- **Backend add-channel/add-competitor API routes** (no UI) to seed `watched_channels` / `competitor_channels`.

### Explicitly out of scope (deferred to later sub-phases)

- **LLM classifier (§4.3)** — vision + transcript topic/format labelling. Sub-phase C writes observations with **no classification**.
- **Caption/transcript fetch (`captions.list`/`captions.download`)** — a classifier input, built with the classifier in Sub-phase D.
- **Clustering (§4.6), niche scoring (§4.4), sealed predictions (§4.13), digest email (§4.10).**
- **All UI** — no pages. The watch-list/competitor add flows are backend routes only; their modals come with the Niche-Finder UI sub-phase.
- **`/admin/ingestion-health` page** — Sub-phase C produces the data; the page is built later. (We ship the table + repo now so the page is trivial later.)

### Carry-forward constraints (honored)

- **TypeScript strict, no `any`.** Zod at HTTP boundaries. `server-only` on every secret-holding / DB module.
- **Reuse existing repository helpers; only fill genuine gaps.** No re-rolling.
- **Reddit = free public JSON API, no OAuth, no cookies.** The "cookies-only manual-URL ingest" carry-forward refers to the deferred Plan #4 *clip-download* path, **not** niche topic-discovery, which only reads public post text. Never build Reddit OAuth.
- **Vercel AI Gateway exclusively** if any model call is needed (none in Sub-phase C — classifier is deferred).
- **Quality over speed** — full multi-source signal + real resilience/QC in v1; cut by capability boundary (no classifier), not by stripping quality within ingestion.

---

## 2. Architecture

Follows the established Plan #4 scraper pattern exactly:

```
pure logic (testable)            thin wiring (cron route)
src/lib/ingestion/<source>.ts ◄─ src/app/api/cron/<name>/route.ts
   (client + repo injected)         assertCronAuth → loadEnv →
   → { ingested, skipped,           getServiceClient → build client
       quotaUnits, status }         + repo → call lib → ingestion_runs
                                     → NextResponse.json(scraperLog(...))
```

- **Adapters** live in `src/lib/ingestion/`. Each is a pure async function that takes an injected client (YouTube/Reddit/Trends), a repo object, and a config, and returns an `IngestionResult` (`{ ingested, skipped, quotaUnits, status, errors }`). No direct `fetch` of secrets, no `getServiceClient` inside the lib — everything injected so tests mock the client + repo with zero real HTTP.
- **Cron routes** are ~30 lines: auth, env guard (return 500 if the source's key is missing), construct the real client + repo, call the adapter inside a `runWithIngestionLog(...)` wrapper, return `scraperLog(name, result)`.
- **Shared helpers reused as-is** from `src/lib/scrapers/shared.ts`: `assertCronAuth`, `scraperLog`, `serializeError`, `withRetry`.
- **Env** via `loadEnv()` (`src/lib/env.ts`); **service client** via `getServiceClient()` (`src/lib/supabase/server.ts`).

### Cron topology (Approach A — one cron per source/concern)

| Route | Schedule (UTC) | Writes | Notes |
|---|---|---|---|
| `/api/cron/youtube-category-sweep` | `0 */6 * * *` (every 6h) | `shorts_observations` (most_popular) | 12 categories × `videos.list(mostPopular)` ≈ 12 units/sweep × 4 = ~48/day |
| `/api/cron/youtube-shorts-search` | `0 8 * * *` (daily) | `shorts_observations` (search) | 8–10 seeds × `search.list`(100) + `videos.list` ≈ 800–1,000/day |
| `/api/cron/watch-list-sync` | `30 */6 * * *` (every 6h) | `video_velocity_snapshots`, `channel_stat_snapshots`, `watched_channels`, `shorts_observations` (watch_list) | velocity + enrichment + auto-discovery + eviction; ~100–200 units/day |
| `/api/cron/reddit-topic-discovery` | `0 9 * * *` (daily) | `shorts_observations` (reddit_topic) | free Reddit JSON; no YouTube quota |
| `/api/cron/google-trends` | `30 9 * * *` (daily) | `shorts_observations` (google_trends) | `google-trends-api`; no YouTube quota |
| `/api/cron/tiktok-creative-center` | `0 22 * * 0` (weekly Sun) | — | **disabled stub**; logs `status='skipped'` run |

Total YouTube budget ≈ **~1,100 units/day (~11% of the 10k free quota)** — matches parent spec §4.2. Registered in `vercel.ts` `crons[]`. The project is already on Vercel Pro (the render crons run `* * * * *`), so sub-daily cadences deploy fine.

Failure isolation: each cron is independent — one source failing logs a `failed`/`partial` `ingestion_runs` row and never blocks another source. Within a cron, per-unit failures (one bad category, one dead channel) are caught, counted as `skipped`, and downgrade the run to `partial` rather than aborting.

---

## 3. Data: synthetic-ID convention

`shorts_observations.video_id` is the PK (text) and the table is video-shaped, but `source` includes non-video sources. To keep upserts idempotent and the table consistent, IDs are namespaced per source:

| Source | `video_id` | `title` | `description` | `view/like/comment_count` | `channel_id` |
|---|---|---|---|---|---|
| `youtube_most_popular` / `youtube_search` / `youtube_watch_list` | real YT video id | YT title | YT description (≤2000) | YT statistics | YT channel id |
| `reddit_topic` | `reddit:<postId>` | post title | selftext (≤2000) | `view=score`, `comment=num_comments`, `like=0` | `null` |
| `google_trends` | `gtrends:<region>:<slug>` | search term | related-query summary | `view=interest (0–100)` | `null` |
| `tiktok_creative_center` | `tiktok:<hashOrId>` | hashtag/sound label | (when built) | (when built) | `null` |

`duration_seconds`, `thumbnail_url`, `published_at` are populated where the source provides them, else `null`. All writes go through the existing `upsertShortsObservation(...)` helper (`src/lib/supabase/repositories/shorts-observations.ts`), which already upserts on the `video_id` PK — re-observing a video refreshes `last_refreshed_at` and the latest stats.

---

## 4. New migrations

### 4.1 `ingestion_runs`

`supabase/migrations/20260528000011_ingestion_runs.sql` (additive; applied to prod project `jfmjppzjicvbpnlkmxbg` via Supabase MCP after review):

```sql
create table if not exists public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null check (job in (
    'youtube_category_sweep','youtube_shorts_search','watch_list_sync',
    'reddit_topic_discovery','google_trends','tiktok_creative_center'
  )),
  status text not null check (status in ('success','partial','failed','skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  items_ingested integer not null default 0,
  items_skipped integer not null default 0,
  quota_units integer not null default 0,
  error text,
  context jsonb not null default '{}'::jsonb
);

create index if not exists ingestion_runs_job_started_idx
  on public.ingestion_runs (job, started_at desc);
```

`src/lib/supabase/repositories/ingestion-runs.ts` (new), `server-only`:

- `startIngestionRun(supabase, { job }) → IngestionRunRow` — inserts `status='partial'` placeholder with `started_at`, returns id.
- `finishIngestionRun(supabase, { id, status, itemsIngested, itemsSkipped, quotaUnits, error?, context? }) → IngestionRunRow`.
- `listRecentRunsByJob(supabase, { job, limit }) → IngestionRunRow[]`.

A `runWithIngestionLog(supabase, job, fn)` wrapper (in the same module or `src/lib/ingestion/run.ts`) calls `startIngestionRun`, runs the adapter, then `finishIngestionRun` with the result — guaranteeing every cron records a row even on throw (status downgraded to `failed`, `error=serializeError(e)`).

### 4.2 `channel_stat_snapshots`

`watched_channels` stores only `current_subscriber_count` + `subscriber_count_at_add` — a single point, with no history. But §4.5 needs **30d/90d subscriber growth** and **auto_breakout = "2× subs vs 30 days ago"**, both of which require a per-channel time series. Sub-phase A didn't create one, and channel-stat enrichment is exactly where it belongs. New additive migration `supabase/migrations/20260528000012_channel_stat_snapshots.sql`:

```sql
create table if not exists public.channel_stat_snapshots (
  channel_id text not null,
  snapshot_at timestamptz not null default now(),
  subscriber_count bigint not null,
  video_count bigint,
  view_count bigint,
  primary key (channel_id, snapshot_at)
);

create index if not exists channel_stat_snapshots_channel_idx
  on public.channel_stat_snapshots (channel_id, snapshot_at desc);
```

`src/lib/supabase/repositories/channel-stat-snapshots.ts` (new): `insertChannelStatSnapshot(supabase, { channelId, subscriberCount, videoCount?, viewCount? })`; `getSnapshotNearestTo(supabase, { channelId, targetDate })` (closest snapshot ≤ target, for 30d/90d deltas); `listSnapshotsForChannel(supabase, { channelId, limit })`.

**Bootstrap behavior:** growth_30d / growth_90d and auto_breakout require ≥2 snapshots spanning the window, so they populate to `null` / stay dormant until enough history accrues (~first 30 days). The **outlier-based** auto_outlier add does **not** depend on this and works from the first enrichment pass.

Regenerate `src/lib/supabase/types.ts` after applying both migrations.

---

## 5. YouTube Data API client extensions

Extend `src/lib/clients/youtube.ts` (keep `searchShortsByQuery`, `parseISODurationToSeconds`). All functions take `{ apiKey }`, use plain `fetch` to `https://www.googleapis.com/youtube/v3/...` (matching the existing client), return typed results, and are wrapped in `withRetry` by callers.

- `fetchMostPopularByCategory({ apiKey, categoryId, regionCode='US', maxResults=50 })` → `YouTubeVideo[]` via `videos.list?chart=mostPopular&videoCategoryId&part=snippet,statistics,contentDetails`. Caller filters `durationSeconds ≤ 60`. **Cost: 1 unit/call.**
- `fetchVideosByIds({ apiKey, videoIds, part=['statistics','contentDetails'] })` → `YouTubeVideo[]`, **batched 50 IDs/call**. **Cost: 1 unit/batch.**
- `fetchChannels({ apiKey, channelIds })` → `YouTubeChannel[]` via `channels.list?part=snippet,statistics,contentDetails` (statistics→subs, contentDetails→uploads playlist id), **batched 50**. **Cost: 1 unit/batch.**
- `fetchPlaylistItems({ apiKey, playlistId, publishedAfter?, maxResults=50 })` → `{ videoId, publishedAt }[]` via `playlistItems.list?part=contentDetails`. **Cost: 1 unit/call.**

Shared `YOUTUBE_QUOTA_COST` constant map (`search.list=100`, `videos.list=1`, `channels.list=1`, `playlistItems.list=1`) lives in the client and adapters tally it into `ingestion_runs.quota_units`.

No captions functions in Sub-phase C.

---

## 6. Adapters (one per source)

### 6.1 `src/lib/ingestion/youtube-category-sweep.ts`
Iterate the 12 category IDs (config), `fetchMostPopularByCategory`, filter ≤60s, `upsertShortsObservation(source='youtube_most_popular')`. Collect channel IDs for enrichment (see 6.3). Per-category try/catch → `skipped++` + `partial` on any failure.

### 6.2 `src/lib/ingestion/youtube-shorts-search.ts`
Iterate the rotating broad seeds (config), reuse `searchShortsByQuery`, `upsertShortsObservation(source='youtube_search')`. Seed rotation: deterministic daily slice of the seed list (e.g., by day-of-year) so we cover all seeds over a week without blowing quota in one day.

### 6.3 `src/lib/ingestion/watch-list-sync.ts`
Sequential phases, each independently guarded so a later phase still runs if an earlier one partially fails:
1. **Velocity snapshots** — `listActiveWatchedChannels`; per channel: `fetchPlaylistItems(uploadsPlaylistId, publishedAfter=now-7d)` → `fetchVideosByIds` (batched) → `insertVelocitySnapshot(video_id, view/like/comment)` and `upsertShortsObservation(source='youtube_watch_list')`.
2. **Channel-stat enrichment** — `fetchChannels` (batched) for active channels → `insertChannelStatSnapshot(channel_id, subscriberCount, videoCount, viewCount)` (history) **and** `updateWatchedChannelSnapshot(channel_id, currentSubscriberCount, growth30d, growth90d, outlierRate60d, uploadCadencePerWeek, lastSnapshottedAt=now)`. Growth deltas come from `channel_stat_snapshots` via `getSnapshotNearestTo(now-30d / now-90d)`; `null` until that history exists (§4.2 bootstrap).
3. **Auto-discovery (§4.5)** — evaluate channels newly seen in `shorts_observations` (last 48h) **not** already in `watched_channels`:
   - **auto_outlier:** subs ∈ [5k, 500k] AND upload cadence ≥1/wk (last 30d) AND ≥10% of last ≤30 uploads are outliers (video views ≥ 3× channel 28d-avg-views — using **current views of recent uploads** as the v1 proxy, refined by velocity snapshots as they accrue). Works from the first enrichment pass. Add with `discovery_source='auto_outlier'`.
   - **auto_breakout:** current subs ≥ 2× subs ~30d ago (requires a `channel_stat_snapshots` row ~30d old; dormant until history accrues). Add with `discovery_source='auto_breakout'`.
   - Cap total active channels at **1,000**; skip adds past the cap.
   - The outlier math is **pure statistics** (view velocity vs channel average) — no LLM, safely inside the ingestion boundary.
4. **Eviction** — `evictInactiveWatchedChannels(cutoff = now-90d)` (existing helper) for channels with no qualifying outlier activity in 90 days (uses `last_snapshotted_at` proxy in v1; refine when scoring lands).

### 6.4 `src/lib/ingestion/reddit-topic-discovery.ts`
Reuse the existing public-JSON Reddit client (`src/lib/clients/reddit.ts`, `withRetry`, `REDDIT_USER_AGENT`). For each of ~30 seed subreddits (config): pull `top.json?t=week` + `hot/rising`, map each post → `upsertShortsObservation(source='reddit_topic')` with `reddit:<id>` synthetic id. On 429/503, `withRetry` then mark the sub `skipped` and continue (`partial`). No clip download, no media — text signal only.

### 6.5 `src/lib/ingestion/google-trends.ts`
`TrendsClient` interface (`realDailyTrends({ geo, category })`) with the real impl wrapping `google-trends-api`. Query the configured trending categories (entertainment, people-and-society) for `geo='US'`; map each rising search → `upsertShortsObservation(source='google_trends')` with `gtrends:<region>:<slug>` synthetic id, `view_count=interest`. Wrapped so a scraper break is swallowed → `failed` run, never a thrown cron. Injected for testability.

### 6.6 `src/lib/ingestion/tiktok-creative-center.ts`
**Disabled stub.** Exposes the same adapter signature, immediately returns `{ status:'skipped', ingested:0, skipped:0, quotaUnits:0, context:{ reason:'tiktok_disabled_pending_chrome_mcp' } }`. Documented inline that real ingest is operator-gated/Chrome-MCP and slots in later. The cron route still registers + logs the skipped run so freshness tracking shows the source as intentionally idle, not broken.

---

## 7. Repository helpers — reuse + gaps to fill

**Reuse as-is:** `upsertShortsObservation`, `getShortsObservationByVideoId`, `listShortsObservationsBySource` (shorts-observations.ts); `upsertWatchedChannel`, `listActiveWatchedChannels`, `evictInactiveWatchedChannels` (watched-channels.ts); `addCompetitorChannel`, `listCompetitorChannels` (competitor-channels.ts).

**Gaps Sub-phase C adds** (genuine missing writers, not re-rolls):
- **`src/lib/supabase/repositories/video-velocity-snapshots.ts`** (new): `insertVelocitySnapshot(supabase, { videoId, viewCount, likeCount, commentCount, snapshotAt? })` (insert into `video_velocity_snapshots`, PK `(video_id, snapshot_at)`); `listSnapshotsForVideo(supabase, { videoId, limit })` for growth math.
- **`watched-channels.ts`** extend: `updateWatchedChannelSnapshot(supabase, { channelId, currentSubscriberCount, subscriberGrowth30d, subscriberGrowth90d, outlierRate60d, uploadCadencePerWeek, lastSnapshottedAt })` — updates snapshot fields on an existing row (distinct from `upsertWatchedChannel`, which is for add).
- **`channel-stat-snapshots.ts`** (new, §4.2): `insertChannelStatSnapshot`, `getSnapshotNearestTo`, `listSnapshotsForChannel`.
- **`ingestion-runs.ts`** (new, §4.1).

---

## 8. API routes (backend only, no UI)

Both Zod-validated, cockpit-auth-gated (same session auth as existing `/api/lab/*` routes), `runtime`/`server-only` consistent with the codebase:

- **`POST /api/watch-list/channels`** — body `{ urlOrHandle: string }`. Resolve to a channel id (parse `/channel/<id>`, `/@handle`, or bare handle → `fetchChannels`/search resolve), fetch stats, `upsertWatchedChannel(discovery_source='manual')`. Returns the created row. 400 on unresolvable input, 409 if already tracked (idempotent upsert is fine — return existing).
- **`POST /api/watch-list/competitors`** — body `{ urlOrHandle: string }`. Resolve + `addCompetitorChannel`. Same validation shape.

These let us seed the watch-list so the `watch-list-sync` cron has channels to act on before the UI exists.

---

## 9. Seed config

`src/lib/ingestion/config.ts` — typed constants, documented as "static defaults; onboarding (§4.14) overrides per-operator later":

- `YOUTUBE_CATEGORIES`: the 12 category IDs + labels (Comedy, Entertainment, Education, Science & Tech, Howto & Style, News, Gaming, Sports, Film & Animation, Music, Pets & Animals, People & Blogs).
- `SHORTS_SEARCH_SEEDS`: 8–10 broad seed phrases.
- `REDDIT_SEED_SUBREDDITS`: ~30 subs (e.g. `NewTubers`, `PartneredYoutube`, plus broad-interest subs).
- `GOOGLE_TRENDS_CATEGORIES`: the entertainment + people-and-society category params for `google-trends-api`.

---

## 10. Resilience & quota

- **Retry:** `withRetry(fn, { attempts: 3, baseDelayMs: 500 })` around each external call.
- **Circuit isolation:** per-source crons are fully independent. Per-unit failures inside a cron are caught, counted (`items_skipped`), and downgrade the run to `partial`; only a total failure throws → `failed`.
- **Quota accounting:** adapters sum `YOUTUBE_QUOTA_COST` per call into the result; `finishIngestionRun` persists `quota_units`. (Sub-phase D's `/admin/costs` reads this.)
- **Idempotency:** all observation writes are upserts on the PK; re-running a cron is safe.
- **Missing-key guard:** a cron returns `500 { error: '<KEY> not set' }` (matching the existing `youtube-trending` route) when its required key is absent — so deploys with blank secrets fail loud per-source, not silently.

---

## 11. Environment variables

Already present in `src/lib/env.ts` (no schema change required for the happy path): `YOUTUBE_API_KEY` (optional), `REDDIT_USER_AGENT` (optional), `CRON_SECRET` (required), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. `google-trends-api` needs no key. `TIKAPI_KEY` exists but the TikTok adapter is disabled, so it's unused in C. Darius populates the real `.env.local` values (currently blank). For local `npm run dev` from a Claude Code shell, add `-u ANTHROPIC_BASE_URL` to the env per the standing note (though no AI calls run in C).

New dependency: **`google-trends-api`** added to `package.json`.

---

## 12. Testing

Vitest, matching existing conventions (mock the injected client + repo; **no real HTTP**):

- **Per-adapter unit tests** (`src/tests/lib/ingestion/<source>.test.ts`): happy path (writes expected observations), partial failure (one unit throws → `partial`, others still written), synthetic-ID shaping (Reddit/Trends ids + field mapping), quota tally correctness.
- **Watch-list math tests:** auto_outlier / auto_breakout threshold boundaries, eviction cutoff, growth-delta + outlier-rate computation, 1,000-channel cap.
- **`ingestion-runs` repo + `runWithIngestionLog`:** records a row on success, on `partial`, and on throw (`failed` with serialized error).
- **YouTube client extension tests:** request URL/params shape + 50-ID batching + quota constants (fetch mocked).
- **Route smoke tests:** `assertCronAuth` rejects missing/bad bearer; missing-key guard returns 500; happy wiring returns `scraperLog` JSON. Add-channel/competitor routes: Zod rejection, resolve+upsert path, auth gate.

No regression to the existing suite (334 passing + 25 design-system = 359 baseline; the 11 env-gated failures stay unchanged).

---

## 13. File manifest

**New:**
- `supabase/migrations/20260528000011_ingestion_runs.sql`
- `supabase/migrations/20260528000012_channel_stat_snapshots.sql`
- `src/lib/supabase/repositories/ingestion-runs.ts`
- `src/lib/supabase/repositories/video-velocity-snapshots.ts`
- `src/lib/supabase/repositories/channel-stat-snapshots.ts`
- `src/lib/ingestion/run.ts` (the `runWithIngestionLog` wrapper, if not co-located in ingestion-runs.ts)
- `src/lib/ingestion/config.ts`
- `src/lib/ingestion/youtube-category-sweep.ts`
- `src/lib/ingestion/youtube-shorts-search.ts`
- `src/lib/ingestion/watch-list-sync.ts`
- `src/lib/ingestion/reddit-topic-discovery.ts`
- `src/lib/ingestion/google-trends.ts`
- `src/lib/ingestion/tiktok-creative-center.ts`
- `src/app/api/cron/youtube-category-sweep/route.ts`
- `src/app/api/cron/youtube-shorts-search/route.ts`
- `src/app/api/cron/watch-list-sync/route.ts`
- `src/app/api/cron/reddit-topic-discovery/route.ts`
- `src/app/api/cron/google-trends/route.ts`
- `src/app/api/cron/tiktok-creative-center/route.ts`
- `src/app/api/watch-list/channels/route.ts`
- `src/app/api/watch-list/competitors/route.ts`
- `src/tests/lib/ingestion/*.test.ts`, `src/tests/api/cron/*` smoke tests

**Changed:**
- `src/lib/clients/youtube.ts` (add 4 fetch functions + quota map)
- `src/lib/supabase/repositories/watched-channels.ts` (add `updateWatchedChannelSnapshot`)
- `src/lib/supabase/types.ts` (regenerate after migration)
- `vercel.ts` (register 6 crons)
- `package.json` (add `google-trends-api`)

---

## 14. Sub-phase C success criteria

- Both new migrations (`ingestion_runs`, `channel_stat_snapshots`) applied to prod; `types.ts` regenerated; `npx tsc --noEmit` clean; no `any`.
- Each of the 6 cron routes is auth-gated, returns a `scraperLog` JSON, and records an `ingestion_runs` row (`tiktok-creative-center` records `skipped`).
- Each enabled adapter has unit tests for happy path + partial failure + (where applicable) synthetic-ID shaping; full suite green except the known 11 env-gated pre-existing failures.
- With real secrets populated, each enabled source produces ≥1 successful run persisting rows to `shorts_observations` (and `video_velocity_snapshots` for watch-list). *(Live-run verification is operator-gated on Darius's API keys; the implementer ships green tests + the wiring, and we do a live smoke once keys are in.)*
- Add-channel/add-competitor routes resolve a YouTube URL/handle and seed the respective table.
- `vercel.ts` registers the 6 crons at the cadences in §2.

---

## 15. Open items (handled at implementation or by operator)

- **Real secrets** (`YOUTUBE_API_KEY`, `SUPABASE_*`, `REDDIT_USER_AGENT`) — Darius populates `.env.local`; live smoke after.
- **Google Trends scraper fragility** — `google-trends-api` is unofficial; wrapped so breakage degrades to a `failed` run, not a crash. If it breaks persistently, the source is dropped without affecting others.
- **TikTok real ingest** — deferred; revisit when an operator-driven Chrome-MCP flow or a TOS-compliant data path is chosen.
- **Eviction precision** — v1 uses `last_snapshotted_at` as the staleness proxy; refine to true "zero outliers in 90d" once the outlier/scoring layer lands in Sub-phase D.

---

**End of spec.** Next: writing-plans to break this into per-task implementer assignments (subagent-driven-development, spec + quality review per task).
