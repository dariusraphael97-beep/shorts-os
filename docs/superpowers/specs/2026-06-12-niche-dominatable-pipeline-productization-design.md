# Productize the dominatable-niche pipeline

**Date:** 2026-06-12
**Branch:** `feat/niche-dominatable-pipeline` (off current `main`)
**Status:** design — awaiting spec review

## Problem

The dominatable "first-mover" signal (`firstMoverScore`, [components.ts](../../../src/lib/scoring/components.ts)) is wired into the scoring math, but **it never fires in the automated pipeline**. Verified live (2026-06-12):

- **All 7,122 `shorts_observations` rows have `channel_subscriber_count = NULL`.** The cron sweeps (`youtube_category_sweep`, `youtube_shorts_search`) never call `channels.list`, so `viewsToSubsRatio` → null → `firstMoverScore` → null for every cron-built cluster.
- The sweeps **only ingest shorts** (`durationSeconds ≤ 60`), while the dominatable playbook targets **longform** (≥ 240 s).

The only thing that computes the signal on live data is the one-off `scripts/seed-niches.mjs`, which calls `channels.list` itself and writes `niche_clusters` rows **directly** — bypassing the LLM classify → cluster → score pipeline (raw truncated video titles as `canonical_topic`, a hardcoded `format_label`, its own scoring, no taxonomy / production-fit / cross-source dedup).

## Goal

Make the cron pipeline produce dominatable longform niches **automatically**, through the real classify → cluster → score path, so the `/niches` dominatable band and Mission Control's Niche Scout card stay live without the manual seed script.

## Key insight (what makes this small)

`classify-observations` and `cluster-niches` have **no source or duration filter** and a 28-day lookback ([cluster-niches route](../../../src/app/api/cron/cluster-niches/route.ts) `since = now − 28d`; [listClassifiedObservationsSince](../../../src/lib/supabase/repositories/shorts-observations.ts)). Clustering reads `channel_subscriber_count` straight off each observation ([cluster-niches.ts:28](../../../src/lib/ingestion/cluster-niches.ts)). So **longform observations flow through the existing pipeline untouched** — we only need to (a) ingest longform dominatable candidates and (b) populate `channel_subscriber_count`. Channel age is a scoring refinement on top.

`fetchChannels` already requests `part=snippet,statistics,contentDetails` ([youtube.ts:261](../../../src/lib/clients/youtube.ts)) — so `snippet.publishedAt` (channel creation date, for the age signal) is already in the response, just unmapped.

## Architecture

### One bundled migration (single prod-migration OK)

`supabase/migrations/2026XXXXXXXXXX_dominatable_sweep.sql`:

1. Redefine `ingestion_runs_job_check` to add `'youtube_dominatable_sweep'` (the new cron must log to the `ingestion_runs` ledger or it is invisible in Mission Control — see [migration 20260611000001](../../../supabase/migrations/20260611000001_ingestion_runs_performance_sync.sql) for the existing 9-name constraint).
2. Redefine `shorts_observations_source_check` to add `'youtube_dominatable'` (verified: the table has a source CHECK enumerating the existing 6 sources; the upsert would 400 without this).
3. `alter table shorts_observations add column channel_published_at timestamptz;` (nullable; the channel-age signal for Phase 2).

Bundling all three avoids separate prod-migration gates. The migration must be applied before Phase 1 code merges (the ledger insert would otherwise violate the CHECK). Apply to a Supabase **branch** first, verify, then prod (Darius-gated per the standing prod-migration rule).

### Phase 1 — Longform dominatable sweep + channel enrichment

**New pure lib** `src/lib/ingestion/youtube-dominatable-sweep.ts`, same shape as the other sweeps (injected `client` + `repo` interfaces, returns `AdapterResult`):

```
runDominatableSweep({ client, repo, seeds, apiKey }):
  for each seed:
    ids   = client.searchLongform({ query: seed, apiKey })      // search.list videoDuration=medium, order=viewCount, publishedAfter≈120d, regionCode=US, relevanceLanguage=en
    vids  = client.fetchVideosByIds({ ids, apiKey })            // existing fetchVideosByIds (stats + duration + channelId)
  channels = client.fetchChannels({ channelIds: distinct(vids.channelId), apiKey })  // existing fetchChannels → subscriberCount (+ publishedAt in Phase 2)
  for each vid passing the dominatable gate:
    repo.upsertObservation({ source:'youtube_dominatable', channelSubscriberCount, durationSeconds, ... })
  return { ingested, skipped, quotaUnits, partial }
```

- **Dominatable gate** (configurable constants, mirroring the proven seed): `durationSeconds ≥ 240`, has channel-stats, channel `viewsToSubs ≥ 3`, `bestViews ≥ 300_000`, channel age `≤ 365d`. The gate keeps the feed focused; `firstMoverScore` + `selectDigest` still do the final ranking.
- **Enrichment**: populate `channel_subscriber_count` **and** `channel_published_at` from `fetchChannels` (the latter needs the one-field `mapChannelItem` change below — data is already fetched). `upsertShortsObservation` accepts `channelSubscriberCount` today; add `channelPublishedAt` to its params. Capturing channel age in Phase 1 (it's free) is what lets the gate apply the `≤ 365d` check; Phase 2 only adds it to the *score*.
- **One-field client change**: map `snippet.publishedAt` → `YouTubeChannel.publishedAt` in [mapChannelItem](../../../src/lib/clients/youtube.ts).

**New cron route** `/api/cron/youtube-dominatable-sweep/route.ts`, mirroring [youtube-category-sweep route](../../../src/app/api/cron/youtube-category-sweep/route.ts):

```ts
runWithIngestionLog(supabase, 'youtube_dominatable_sweep', () =>
  runDominatableSweep({ client: { searchLongform, fetchVideosByIds, fetchChannels }, repo, seeds: DOMINATABLE_SEEDS, apiKey }))
```

`runWithIngestionLog` ([ingestion/run.ts](../../../src/lib/ingestion/run.ts)) is the tolerant start/finish ledger wrapper (inserts a `partial` row at start, updates status at finish, logs failures).

**Wiring (kept in sync — Darius's review point):**
- `IngestionJob` union in [ingestion-runs.ts:5](../../../src/lib/supabase/repositories/ingestion-runs.ts): add `'youtube_dominatable_sweep'` (the TS union mirrors the DB CHECK).
- `niche_scout` in [assistants/registry.ts:62](../../../src/lib/assistants/registry.ts): add `'youtube_dominatable_sweep'` to `ingestionJobs` and a `{ label: 'Dominatable sweep', cron: '30 7 * * *' }` schedule entry. `maxExpectedGapHours: 13` is unchanged (densest cadence stays the 6h category sweep; daily 24h doesn't tighten it).
- `vercel.ts` crons: `{ path: '/api/cron/youtube-dominatable-sweep', schedule: '30 7 * * *' }` — **must match the registry schedule** (07:30 UTC daily: after the 00:15/06:15 classify ticks have drained, before the 08:00 shorts-search, well before the Sunday 23:00 cluster).
- `DOMINATABLE_SEEDS` constant in `src/lib/ingestion/config.ts` (the seed list from `seed-niches.mjs`).

**Outcome:** the weekly `cluster-niches` now computes real `firstMoverScore` for dominatable longform niches with proper LLM topics/taxonomy/dedup, and `replaceWeek` makes it the source of truth. `seed-niches.mjs` is **retained as a manual fallback** (superseded, not deleted). Quota ≈ 1.2k units/run (cap 10k/day).

### Phase 2 — Channel-age recency in `firstMoverScore`

Phase 1 already captures and stores `channel_published_at`; Phase 2 is **scoring only**:

- Thread `channel_published_at` → `ClusterInputRow` ([cluster.ts](../../../src/lib/clustering/cluster.ts)) → `computeComponents`: fold a **null-safe** recency multiplier into `firstMoverScore` (matches playbook criterion #1 "recently started" + the seed's `* recency = max(0.2, 1 − ageDays/365)`). Surface `channelAgeDays` in `explainabilityTopSignals`. Null age → multiplier 1 (no penalty), preserving back-compat for sources without channel age.

This makes the productized ranking match the seed's proven ordering. It can ship in the same PR as Phase 1 or immediately after — no further migration.

## Data flow

```
youtube_dominatable_sweep (daily 07:30)
  → shorts_observations (source=youtube_dominatable, channel_subscriber_count set, channel_published_at set [P2], duration≥240)
classify_observations (every 6h)
  → shorts_classifications (topic_label, format_label, audience_signal) — no source/duration filter
cluster_niches (weekly Sun 23:00, 28-day lookback)
  → buildClusters → computeComponents (firstMoverScore from views/subs [+age P2]) → niche_clusters (replaceWeek)
/niches feed + Mission Control Niche Scout (reads niche_clusters + ingestion_runs ledger)
```

## Testing (TDD)

Pure functions and injected clients — no live API in tests (mirror the existing sweep tests):
- `youtube-dominatable-sweep.test.ts`: dominatable gate (duration / views / ratio boundaries), enrichment mapping (subs written), `AdapterResult` counts, partial-on-failure.
- `components.test.ts` (Phase 2): recency-folded `firstMoverScore` — null age → no penalty; younger channel → higher score; matches the seed's `*recency` shape.
- Route smoke test mirroring [youtube-category-sweep test](../../../src/tests/api) — asserts `runWithIngestionLog` is called with `'youtube_dominatable_sweep'`.
- `IngestionJob` union change is covered by tsc.

## Out of scope (YAGNI)

- Renaming `shorts_observations` (misleading once it holds longform, but a large, risky rename for no functional gain).
- Retrofitting channel enrichment into the *shorts* sweeps (`category_sweep` / `shorts_search`) — a separate later improvement for shorts niches.
- Broadening the classifier's "Short" prompt wording — it classifies any video correctly as-is.

## Risks / notes

- **Migration ordering**: the ledger CHECK must be live before Phase 1 deploys, or the first run's `startIngestionRun` insert 400s. Apply migration → verify on branch → merge code.
- **Seed clobber risk (now resolved)**: previously a worry that Sunday's `cluster_niches` would overwrite the good seed with null-firstMover shorts clusters. This build resolves it — `cluster_niches` becomes the real dominatable source.
- **`watch_list_sync` is 504-timing-out** in prod (separate bug; the only other subscriber-data path). Not required for this build but worth a follow-up.
