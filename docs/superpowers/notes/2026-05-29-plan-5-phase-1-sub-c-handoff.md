# Plan #5 Phase 1 Sub-phase C — handoff (2026-05-29)

PR: https://github.com/dariusraphael97-beep/shorts-os/pull/15

Branch: `plan-5-phase-1-sub-c`. First sub-phase with **crons + API routes**. Ingestion only — produces the raw signal Sub-phase D consumes. No classifier, no clustering, no scoring, no UI.

## What Sub-phase C ships

**6 ingestion crons** (one per source/concern; pure injected-client adapter in `src/lib/ingestion/<source>.ts` + thin route in `src/app/api/cron/<name>/route.ts`; each wrapped in `runWithIngestionLog`):

- `youtube-category-sweep` (`0 */6 * * *`) — `videos.list?chart=mostPopular` × 12 categories, ≤60s filter → `shorts_observations` (`youtube_most_popular`).
- `youtube-shorts-search` (`0 8 * * *`) — `search.list` over `rotatingSeedSlice(SHORTS_SEARCH_SEEDS, 8)` → `shorts_observations` (`youtube_search`).
- `watch-list-sync` (`30 */6 * * *`) — 4 guarded phases: velocity snapshots → `video_velocity_snapshots`; enrichment → `watched_channels` + `channel_stat_snapshots`; §4.5 auto-discovery (outlier/breakout) → `watched_channels`; 90-day eviction. **Phase 1's per-channel video fetch is cached and reused by phase 2** (no double quota spend).
- `reddit-topic-discovery` (`0 9 * * *`) — free public Reddit JSON over ~30 seed subs → `shorts_observations` (`reddit_topic`, synthetic `reddit:<id>`). No OAuth/cookies.
- `google-trends` (`30 9 * * *`) — `google-trends-api` daily trends (US) → `shorts_observations` (`google_trends`, `gtrends:US:<slug>`). Behind a `TrendsClient` interface; scraper break → `failed` run, not a crash.
- `tiktok-creative-center` (`0 22 * * 0`) — **disabled stub** (Vercel cron can't drive Chrome MCP); returns `status:'skipped'`. Real ingest slots in later without reshaping the pipeline.

**2 new additive tables** (migrations `20260528000011_ingestion_runs.sql`, `20260528000012_channel_stat_snapshots.sql` — applied to prod `jfmjppzjicvbpnlkmxbg`):
- `ingestion_runs` — per-source run health (`job`, `status`, counts, `quota_units`, `error`, `context`). Powers `/admin/ingestion-health` (Sub-phase D builds the page).
- `channel_stat_snapshots` — per-channel subscriber/stat time series. The substrate §4.5 growth + breakout math needs (Sub-phase A only stored a single `current_subscriber_count`).

**Repo additions** (`src/lib/supabase/repositories/`): `ingestion-runs.ts`, `video-velocity-snapshots.ts`, `channel-stat-snapshots.ts`, and `updateWatchedChannelSnapshot` appended to `watched-channels.ts`. `src/lib/supabase/types.ts` regenerated.

**YouTube client** (`src/lib/clients/youtube.ts`) extended (search-only before): `fetchVideosByIds` (50-batched), `fetchMostPopularByCategory`, `fetchChannels`, `fetchPlaylistItems`, `resolveChannel`, `YOUTUBE_QUOTA_COST`. **No captions** — transcripts are a classifier input (Sub-phase D).

**Run wrapper + config**: `src/lib/ingestion/run.ts` (`runWithIngestionLog` + `AdapterResult`), `src/lib/ingestion/watch-list-math.ts` (pure §4.5 math), `src/lib/ingestion/config.ts` (12 categories, ~10 search seeds, ~30 subreddits, `GOOGLE_TRENDS_GEO`, `rotatingSeedSlice`).

**Backend seed routes** (no UI): `POST /api/watch-list/channels` (manual add → `watched_channels`), `POST /api/watch-list/competitors` (→ `competitor_channels`). Mirror the `/api/lab/*` convention (Zod + `force-dynamic`, no inline session check).

**New dependency**: `google-trends-api` (+ ambient `src/types/google-trends-api.d.ts`).

**6 crons registered** in `vercel.ts`.

## Synthetic-ID convention (so non-video sources fit the video-shaped `shorts_observations`)
- YouTube: real `video_id`. Reddit: `reddit:<postId>` (score→view_count, num_comments→comment_count). Trends: `gtrends:<geo>:<slug>` (traffic→view_count). All upsert through `upsertShortsObservation` on the `video_id` PK.

## Verification state
- `npx tsc --noEmit`: clean, no `any`.
- `npm test`: **418 passing**, 11 failing — all 11 are pre-existing env-gated integration tests (AI gateway / env loader / live-DB schema), unchanged from baseline. No new failures.
- Built subagent-driven (implementer + spec review + code-quality review per task). Two correctness bugs caught/fixed in review: watch-list quota double-fetch (phase-1 cache reuse) and a fail-open `isWatched` (now fail-closed).
- **Live smoke is still pending real secrets** (`YOUTUBE_API_KEY`, `REDDIT_USER_AGENT` blank locally). Each enabled cron's first real run is operator-gated on Darius populating `.env.local` / the deploy env. Trigger via the Vercel dashboard or an authorized `curl` with the `CRON_SECRET` bearer; confirm one `ingestion_runs` row per job + rows in `shorts_observations`.

## Carry-forward notes
- **RLS disabled on all 45 public tables** (pre-existing; app uses cockpit auth + service-role client, not anon key). The 2 new tables inherit this. RLS was NOT auto-enabled. Separate decision if/when desired.
- **Prod migrations require explicit per-action authorization** even though durable instructions authorize "migrations via Supabase MCP" — the auto-mode safety classifier blocks DDL-to-prod until the operator OKs it in-conversation. Surface "about to apply migration X to prod" up front next sub-phase.

## Next: Sub-phase D — Classifier + clustering + scoring (consumes C's `shorts_observations`)
Two-pass vision+transcript LLM classifier (§4.3) → `shorts_classifications` + 5% `classification_samples`; caption/transcript fetch added to the YouTube client; topic fuzzy-merge embeddings + clustering (§4.6) → `niche_clusters`; first-mover + proven scoring (§4.4); the `/admin/ingestion-health` page that reads `ingestion_runs`. All via Vercel AI Gateway.

## Fresh-chat kickoff prompt for Sub-phase D
(See the chat hand-back — paste it into a new chat after this PR merges.)
