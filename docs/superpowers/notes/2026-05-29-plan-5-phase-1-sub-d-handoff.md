# Plan #5 Phase 1 Sub-phase D — handoff (2026-05-29)

Branch: `plan-5-phase-1-sub-d` (off `main`; stacks on the still-open Sub-phase C PR #15). PR against `main`.

Sub-phase D is the niche-finder **"brain"**: it consumes C's raw `shorts_observations` and produces classified, clustered, scored niches plus two admin QC pages. All LLM/embedding work goes through the **Vercel AI Gateway** (`gateway()` from `ai`, reading `AI_GATEWAY_API_KEY`); model strings are runtime-swappable.

## Pipeline shape
ingestion (C) → **`classify-observations` cron** (every 6h) → **`cluster-niches` cron** (weekly Sun 23:00 UTC): cluster → score → two-band/MMR digest-select → persist.

## What Sub-phase D ships

**DB (1 new table + 1 constraint change, applied to prod `jfmjppzjicvbpnlkmxbg`, operator-authorized):**
- `20260529000001_topic_embeddings.sql` — `topic_embeddings` (topic_label PK, model, embedding jsonb, created_at): cross-run embedding cache so the weekly cluster run doesn't re-embed identical labels. No pgvector.
- `20260529000002_ingestion_runs_add_jobs.sql` — widened the `ingestion_runs_job_check` to allow `classify_observations` + `cluster_niches` (so the processing crons log into the same run-health table). `IngestionJob` union extended; `types.ts` regenerated.

**AI Gateway wiring** (`src/lib/ai/models.ts`): `CLASSIFIER_TOPIC_MODEL`/`CLASSIFIER_FORMAT_MODEL` (default `anthropic/claude-haiku-4-5`), `EMBEDDING_MODEL` (default `openai/text-embedding-3-small`) — all env-overridable; `getGatewayModel`, `getGatewayEmbeddingModel`, `assertGatewayConfigured`. New D code uses the gateway exclusively; existing A–C call sites (clip-triage, voice-coach) stay on the direct-Anthropic path (`src/lib/ai/gateway.ts`) — not refactored.

**Transcript client** (`src/lib/clients/youtube-transcript.ts`): unofficial `timedtext`/player-endpoint fetch behind `TranscriptClient`. **The Data API `captions.download` path was deliberately NOT used — it 403s on third-party videos** (correction to the C handoff's note). Resilience-wrapped: any failure → `null`, never fails classification. Balanced-bracket `captionTracks` extraction (robust to nested/sibling arrays). Transcript text is not persisted; only the `transcript_used` flag.

**Classifier** (`src/lib/classifier/`): `taxonomy.ts` (18 format labels, 7 audience signals, `formatToProductionFit`, `PRODUCTION_FIT_WEIGHT`), `schemas.ts` (Zod topic-batch + format), `classify.ts` (pure injectable two-pass orchestration: topic batched 10 with transcript in-prompt + singleton retry; format = one vision call/video at bounded concurrency; `confidence = min`; 5% sampling; `visionUsed` reflects whether a thumbnail was attached). Adapter + cron in `src/lib/ingestion/classify-observations.ts` + `src/app/api/cron/classify-observations/route.ts` (gateway boundary; persists `shorts_classifications` + 5% `classification_samples`; `PER_RUN_LIMIT=150`). Prompt version `d1`.

**Clustering** (`src/lib/clustering/`): `cosine.ts` (`cosine` with zero-vector + dimension-mismatch guards; `fuzzyMergeTopics` greedy-by-frequency, cosine ≥ 0.85 → most-frequent canonical), `cluster.ts` (`buildClusters`: tab-keyed group by (canonical_topic, format_label), min 3 videos, `production_fit` from format, `discovery_state` = `pre_public` unless a broad-public source (`youtube_most_popular`/`google_trends`) is present, modal audience, top-5 examples). `topic-embeddings` repo (`getEmbeddings`/`upsertEmbeddings`).

**Scoring** (`src/lib/scoring/`): `weights.ts` (§4.4 starting weights), `score.ts` (`computeNicheScore` — renormalizing weighted mean over non-null components, records per-component `contributions` for explainability), `components.ts` (cold-start-aware: `saturationInverse`, `productionFitWeight`, `discoveryStateWeight`, `monetizationSignal`→`provenScore` computable now; snapshot/comment-dependent components + `firstMoverScore`/`outlierDensity` return `null` and renormalize — they light up as snapshots accumulate; `comment_depth` permanently null in D), `select.ts` (`assignBand` proven>0.6 / unproven first-mover>0.7; `selectDigest` two-band MMR diversity, targets 5 proven / 3 unproven, assigns `digest_rank`).

**Cluster cron** (`src/lib/ingestion/cluster-niches.ts` + route): joins observations×classifications (28d, conf≥0.5), embeds distinct labels (cache-aware, gateway `embedMany`), fuzzy-merges, builds clusters, scores+selects, writes ALL clusters via `niche-clusters` repo `replaceWeek` (idempotent per `week_start`; `digest_rank` null for unselected).

**Admin QC pages** (new `/admin` route group, design-system `AppShell` + `AdminSidebar`):
- `/admin/ingestion-health` — leads with a health banner, then per-source row (freshness dot via `src/lib/admin/freshness.ts`, last-run summary, recent-status sparkline, "Run now"). Reads `ingestion_runs` (`listLatestRunPerJob`/`listRecentRuns`).
- `/admin/classification-review` — leads with per-`format_label` accuracy, then the unreviewed-sample queue with correct/partial/wrong verdicts.
- Manual trigger: `src/lib/ingestion/registry.ts` (job→cron-path map + `triggerIngestion`) + `POST /api/admin/trigger-ingestion` (server-side authenticated call to the existing cron with the `CRON_SECRET` bearer — no refactor of C's cron routes). Verdict write: `POST /api/admin/review-sample`.

**2 crons registered** in `vercel.ts`.

## Verification state
- `npx tsc --noEmit`: clean, no `any` in source.
- `npm test`: **469 passing, 11 failing** — the 11 are the pre-existing env-gated/live-DB suites (gateway, env loader, supabase server + 4 schema tests), unchanged from the C baseline. **No new failures**; +51 new Sub-phase D tests all pass.
- `npm run build`: compiles + typechecks cleanly. The only prerender error is the **pre-existing** env-dependent `/` cockpit home page failing locally with blank secrets (not force-dynamic; unrelated to D). All D pages/routes are `force-dynamic`.
- Built subagent-driven (implementer + spec/quality review per task). Review caught + fixed: fragile `captionTracks` regex → balanced-bracket scan; an honest `visionUsed` flag; a `cosine` dimension guard; and a plan-test arithmetic bug in the scorer (corrected to 0.715).
- **Live smoke is operator-gated on real secrets** (`AI_GATEWAY_API_KEY`, `YOUTUBE_API_KEY`) — the admin pages and crons can't run locally with blank `.env.local`, same situation as C. See checklist below.

## Operator-gated live smoke (post-merge, needs real env)
1. Set `AI_GATEWAY_API_KEY` + `YOUTUBE_API_KEY` in the deploy env.
2. Trigger `classify-observations` (dashboard or authorized curl with `CRON_SECRET`, or the "Run now" button once `/admin` is reachable). Confirm an `ingestion_runs` row (`job=classify_observations`), new `shorts_classifications`, ~5% `classification_samples`.
3. Trigger `cluster-niches`. Confirm `niche_clusters` rows for the current `week_start` with `production_fit`, `discovery_state`, `niche_score`, and `digest_rank` on the top ~10.
4. Open `/admin/ingestion-health` (all 8 jobs) and `/admin/classification-review` (samples + accuracy). Verify the PostgREST embedded-join in `listUnclassifiedObservations`/`listClassifiedObservationsSince` returns rows; the repo has a documented two-query fallback if PostgREST rejects the relation-null filter.

## Carry-forward notes
- **Prod migrations require explicit, target-naming in-chat authorization** — the auto-mode safety classifier rejected a vague "yes looks good"; it accepted "Apply migrations `X` and `Y` to prod `jfmjppzjicvbpnlkmxbg`." Phrase the ask that specifically next time.
- RLS still disabled on all public tables (pre-existing); `topic_embeddings` inherits this. Separate decision if/when desired.
- Scoring components that are `null` today (90d growth, sub-to-view, repeat-winner, outlier density, first-mover) auto-activate once `channel_stat_snapshots`/`video_velocity_snapshots` accumulate enough history — no code change needed. `comment_depth` stays null until comment ingestion is added (deliberately deferred; it's a distinct ingestion capability).

## Not in D (deferred)
Weekly digest **email** (§4.10) and sealed `niche_predictions` writes (§4.13) — both coupled to "digest send time"; the niche-finder **user** UI surfaces (§4.9); `/admin/prompt-versions` + `/admin/scoring-analysis` (need multiple prompt versions / weeks of action data); comment ingestion; TikTok real ingest.

## Fresh-chat kickoff prompt for Sub-phase E
(See the chat hand-back — paste it into a new chat after this PR merges.)
