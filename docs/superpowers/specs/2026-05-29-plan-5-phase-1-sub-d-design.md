# Plan #5 — Phase 1, Sub-phase D: Classifier + Clustering + Niche Scoring

Design spec. 2026-05-29. Branch `plan-5-phase-1-sub-d` (stacked on `plan-5-phase-1-sub-c`, PR targets `main`).

Companion docs: the Sub-phase C handoff (`docs/superpowers/notes/2026-05-29-plan-5-phase-1-sub-c-handoff.md`) and the Plan #5 design spec (`docs/superpowers/specs/2026-05-28-plan-5-creator-copilot-design.md`, §4.1 data model, §4.3 classifier, §4.4 scoring, §4.6 clustering, §4.12 QC surfaces). This doc resolves spec ambiguities and corrects two assumptions that don't survive contact with the real APIs (transcripts, AI Gateway wiring).

## 1. Goal & position in the pipeline

Sub-phase C fills `shorts_observations` with raw rows from 6 sources. Sub-phase D is the niche-finder **brain** that turns those raw observations into ranked niches:

```
ingestion (C) ──▶ classify ──▶ cluster + score ──▶ digest selection (digest_rank)
                  [cron]        [cron, weekly]
```

D ships: a transcript client, AI Gateway wiring, a two-pass classifier + its cron, embeddings-based topic clustering + scoring + two-band/MMR digest selection in a weekly cron, two admin QC pages, one additive table, and the cron registrations.

**Hard rules carried forward:** quality over speed (full vision + transcript + QC in v1; cut by capability boundary, never by stripping quality); TypeScript strict, no `any`; premium UI is first-class (9/10, lead with the one primary signal) for the admin surfaces; this is NOT the Next.js you know — read `node_modules/next/dist/docs/` before writing Next code; AI Gateway exclusively for new D code; prod migrations require explicit in-chat sign-off before apply; unset / `-u ANTHROPIC_BASE_URL` for local `npm run dev`.

## 2. Decisions locked in brainstorming

1. **Transcripts via the unofficial timedtext endpoint**, not the YouTube Data API. The Data API `captions.download` returns 403 for any video you don't own, so it is useless for third-party trending videos. We instead fetch auto-captions from YouTube's public `timedtext`/player endpoint — the same unofficial-but-free pattern C already uses for Reddit JSON and `google-trends-api`. This **overrides** the C handoff's note to add `captions.list`/`captions.download` to the YouTube Data client.
2. **In-memory clustering with a small jsonb embedding cache.** No pgvector. The weekly run embeds the distinct `topic_label`s (a few hundred to low thousands) and does cosine clustering in JS; embeddings are cached in a `topic_embeddings` table keyed by label text so identical labels aren't re-embedded across runs.
3. **Renormalizing scorer.** Every §4.4 component is implemented; each returns a value or `null` when its data is insufficient. `niche_score` renormalizes the weights over the non-null components. `comment_depth_score` ships as a permanent-for-now `null` because comment-text ingestion is deferred (a separate ingestion capability).
4. **Admin scope = `/admin/ingestion-health` + `/admin/classification-review`.** `prompt-versions` and `scoring-analysis` are deferred — they need multi-version / multi-week data that doesn't exist on day one.
5. **AI Gateway for new D code only.** Existing A–C call sites stay on the direct Anthropic path; no unrelated refactor.

## 3. Transcript client (new)

`src/lib/clients/youtube-transcript.ts`

- Export a `TranscriptClient` interface: `fetchTranscript(videoId: string): Promise<TranscriptResult | null>`, where `TranscriptResult = { text: string; language: string; auto_generated: boolean }`.
- Default implementation fetches the video's `timedtext` track (resolve the caption track baseURL from the player response or the `timedtext` list endpoint, prefer an English auto-caption, fall back to the first available track) and flattens the cue segments into plain text.
- **Resilience:** any network error, missing-captions case, or parse failure returns `null`. A `null` transcript never throws and never fails a classification — it just means `transcript_used = false`.
- No persistence of transcript text. The classifier consumes it transiently; the only durable record is the `transcript_used` boolean on `shorts_classifications`. Re-classification re-fetches (free).
- Injected into the classifier like every other client (no module-level singletons) so it can be mocked in tests.

> The YouTube **Data** client (`src/lib/clients/youtube.ts`) is **not** extended in D. No captions endpoints there.

## 4. AI Gateway wiring (new)

`src/lib/ai/models.ts`

- Export runtime-swappable model-string constants, each overridable by env, with the spec defaults:
  - `CLASSIFIER_TOPIC_MODEL` — default `anthropic/claude-haiku-4-5`
  - `CLASSIFIER_FORMAT_MODEL` — default `anthropic/claude-haiku-4-5`
  - `EMBEDDING_MODEL` — default `openai/text-embedding-3-small`
- Export `getGatewayModel(modelString: string)` — a thin resolver that returns a model handle usable by the AI SDK's `generateObject` / `embed` / `embedMany`, routed through the **default AI Gateway** provider (plain `"provider/model"` strings; requires `AI_GATEWAY_API_KEY`, already defined-but-unused in `src/lib/env.ts` — promote it to used and document it).
- `src/lib/env.ts`: keep `AI_GATEWAY_API_KEY` optional (so unit tests with mocks don't need it), but the classifier/embedding code paths assert its presence at call time and fail with a clear message when blank (mirrors how the crons assert `YOUTUBE_API_KEY`).
- New D code calls **only** the gateway path. The existing `getClaudeModel()` (direct `@ai-sdk/anthropic`) used by `clip-triage`/`voice-coach` is left untouched.

## 5. Classifier (new) + `classify-observations` cron

### 5.1 Library — `src/lib/classifier/`

Two LLM passes per §4.3 (combining them hurt accuracy in prototypes).

**Inputs assembled per video** (from `shorts_observations` + the transcript client): title, description (truncated 300 chars), tags, channel name, duration, view/like/comment counts, channel subscriber count, `thumbnail_url`, and transcript (when available).

**Pass 1 — topic** (text only; vision deliberately *not* used — the thumbnail is a clickbait artifact, not a topic source):
- Inputs: title + description + tags + transcript + channel context.
- Output schema (Zod, via `generateObject`): `{ topic_label: string /* 2–4 word noun phrase */, audience_signal: AudienceSignal, confidence: number /* 0–1 */ }`.
- **Batched 10 videos per call** via an array-output schema (`{ results: TopicResult[] }`), since the topic pass batches well. Prompt enumerates the 10 videos with stable indices; validate the response length matches the batch and re-issue singly for any dropped/garbled entries.

**Pass 2 — format** (vision):
- Inputs: title + duration + visual cues + thumbnail image (base64-encoded into the call).
- Output schema: `{ format_label: FormatLabel, confidence: number }`.
- **One call per video** (vision batches poorly). Run with **bounded concurrency** (default 6, configurable) so a full per-run batch fits inside the 300 s function timeout.

**Enums (single source of truth in the classifier lib, asserted against the DB check constraints):**
- `AudienceSignal`: `seniors | gen_z | millennials | kids | professionals | hobbyists | general`.
- `FormatLabel` (18): `narrated_storytelling`, `talking_head_facts`, `talking_head_advice`, `compilation_montage`, `transformation_reveal`, `ranking_list`, `before_after`, `tutorial_quick`, `pov_skit`, `screen_record_walkthrough`, `ai_voiceover_facts`, `reaction`, `interview_clip`, `news_recap`, `product_review`, `meme_format`, `live_capture`, `other`.

**Persistence:**
- Upsert `shorts_classifications` (`topic_label`, `format_label`, `audience_signal`, `confidence` = min of the two-pass confidences, `model` = the gateway strings used, `prompt_version`, `vision_used` = true, `transcript_used`, `classified_at`). Use the existing `upsertClassification` repo.
- **5% random sample** → `classification_samples` with the full prompt + full response + chosen labels. Requires a new `classification-samples` repo (see §9).
- `production_fit` is **not** stored on `shorts_classifications` (no such column; the spec's "computed at classification time" is satisfied by deriving fit at cluster time from `format_label` — §6).

**Confidence floor:** rows with `confidence < 0.5` are written but excluded from clustering; retained for re-classification on the next prompt version.

**Versioning:** `prompt_version` is a constant in the classifier lib (start `"d1"`). Bump on any prompt change. The cron re-classifies stale rows (`prompt_version != current`) via `listStaleClassifications`.

### 5.2 Cron — `classify-observations`

`src/app/api/cron/classify-observations/route.ts`, `maxDuration = 300`, `assertCronAuth` + `getServiceClient`, asserts `YOUTUBE_API_KEY`-style for `AI_GATEWAY_API_KEY`, delegates to a `runClassification` adapter wrapped in `runWithIngestionLog(supabase, 'classify_observations', …)`.

- Selects **unclassified** observations (no row in `shorts_classifications`) plus **stale-version** rows, newest first, capped per run (default ~150 total — sized so the serial-ish vision pass fits 300 s at concurrency 6).
- Adapter returns an `AdapterResult` (`ingested` = classified count, `skipped`, `quotaUnits` = 0 — gateway tokens tracked separately, `context` = `{ new: n, restale: m, transcript_hit_rate }`).
- Schedule: `15 */6 * * *` (offset 15 min after the `0 */6` category sweep and before/after watch-list at `:30`).

Selecting unclassified observations needs a query the current `shorts-observations` repo doesn't expose → add `listUnclassifiedObservations(supabase, { limit })` (left-anti-join against `shorts_classifications`) to that repo (§9).

## 6. Embeddings + clustering (new) + `cluster-niches` cron

### 6.1 Library — `src/lib/clustering/`

Per §4.6:

1. **Input join:** `shorts_observations` × `shorts_classifications` over the last 28 days where `confidence ≥ 0.5`. Add a repo query `listClassifiedObservationsSince(supabase, { since, minConfidence })` returning the joined shape the clustering needs (video_id, source, channel_id, topic_label, format_label, audience_signal, view/like/comment counts, published_at, channel_subscriber_count).
2. **Topic fuzzy-merge:** collect distinct `topic_label`s; embed each via `embedMany` through the gateway (`EMBEDDING_MODEL`), **reading/writing the `topic_embeddings` cache** so identical labels embed once ever. Compute pairwise cosine; merge labels at cosine **≥ 0.85** into canonical groups; canonical surface form = most-frequent label in the group.
3. **Cluster:** group merged rows by `(canonical_topic, format_label)`. **Minimum 3 videos** to qualify.
4. **Per-cluster derived fields:**
   - `production_fit` from the deterministic §4.3 map applied to the cluster's `format_label`:
     - `native`: `ai_voiceover_facts`, `compilation_montage`, `ranking_list`, `news_recap`, `narrated_storytelling`
     - `needs_manual_recording`: `talking_head_facts`, `talking_head_advice`, `tutorial_quick`, `product_review`
     - `needs_manual_editing`: `transformation_reveal`, `before_after`, `pov_skit`, `reaction`, `interview_clip`, `screen_record_walkthrough`, `meme_format`, `live_capture`
     - `manual_only`: `other`
   - `discovery_state`: **`pre_public` iff the cluster has zero observations from broad-public sources (`youtube_most_popular`, `google_trends`); otherwise `public`.** (Resolves a spec ambiguity. Rationale: most-popular/Trends mean the topic is already broadly visible; watch-list/Reddit/search-only signal means it's still early.)
   - `audience_signal`: modal value across the cluster.
   - `example_video_ids`: top N (≤5) by view velocity.
   - `first_seen_at`: earliest `published_at`/`observed_at` for the `(canonical_topic, format_label)` combo across all sources.
   - aggregates: `channel_count`, `avg_views`, `avg_velocity_24h`, `outlier_density`.
5. Write `niche_clusters` rows for `week_start` (the run's ISO week Monday) via `insertNicheCluster`. Scores and `digest_rank` filled by §7 before/at insert.

### 6.2 Cron — `cluster-niches`

`src/app/api/cron/cluster-niches/route.ts`, `maxDuration = 300`, same auth/service-client/gateway-assert pattern, delegates to `runClustering` wrapped in `runWithIngestionLog(supabase, 'cluster_niches', …)`. Schedule: **`0 23 * * 0`** (Sunday 23:00 UTC). The run does cluster → score → digest-select → persist in one pass.

## 7. Scoring + digest selection (new)

`src/lib/scoring/`

### 7.1 Components (§4.4) — each a pure function returning `number | null`

**First-mover:**
- `niche_age_days` = days since `first_seen_at` for the combo.
- `outlier_density` = fraction of cluster videos with `view_velocity_24h = views_at_24h / channel_28d_avg_views > 5.0`. (`views_at_24h` from `video_velocity_snapshots` nearest 24 h post-publish; `channel_28d_avg_views` computed from the channel's recent observations. `null` when neither snapshot nor channel baseline is available.)
- `avg_velocity` = mean `view_velocity_24h` across cluster outliers.
- `first_mover_score = normalize( (1/max(niche_age_days,1)) × outlier_density × log(1+avg_velocity) )`.

**Proven:**
- `channel_growth_score` = fraction of cluster channels with positive 30d AND 60d AND 90d subscriber growth (from `channel_stat_snapshots`). **`null` until ≥90 d of snapshots exist** for enough channels — cold-start component.
- `sub_to_view_ratio` = median `subscribers / 28d_avg_views` across cluster channels.
- `comment_depth_score` = **always `null` in D** (no comment-text ingestion). Implemented as a stub returning `null` so it slots in later without a formula change.
- `repeat_winner_density` = fraction of cluster channels with ≥3 outlier videos in the past 90 d in this niche (from velocity snapshots + observations).
- `monetization_signal_score` = fraction of cluster channels with membership/sponsorship/merch mentions in recent video descriptions (regex/keyword scan over `shorts_observations.description`).
- `proven_score = weighted_mean` of the non-null subset, normalized.

### 7.2 `niche_score` with renormalization

```
weights = {
  first_mover_score: 0.25,
  proven_score:      0.25,
  saturation_inverse:0.15,   // 1 / log(channel_count + 2)
  production_fit:    0.15,   // native=1.0, needs_manual_recording=0.7, needs_manual_editing=0.5, manual_only=0.2
  discovery_state:   0.10,   // pre_public=1.0, public=0.5
  outlier_density:   0.10,
}
```

`niche_score = Σ(weightᵢ × valueᵢ) / Σ(weightᵢ)` over components whose value is non-null. (If `proven_score` or `first_mover_score` is itself null because all their sub-components were null, they drop out and the remaining weights renormalize.) `saturation_inverse`, `production_fit`, and `discovery_state` are always computable, so the denominator is never zero.

`explainability_top_signals` (jsonb on `niche_clusters`): record each component's raw value, normalized contribution, and whether it was available — this powers the future "Why this niche?" surface and makes cold-start honest.

Weights live in a config object (`src/lib/scoring/weights.ts`) so they're tunable later via `/admin/scoring-analysis` (deferred page) without code spelunking.

### 7.3 Two-band digest selection + MMR

- **Proven + trending band:** high `niche_score` AND `proven_score > 0.6`.
- **Trending, unproven band:** high `niche_score` AND `proven_score ≤ 0.6` (or null) AND `first_mover_score > 0.7`. Surfaced later with an explicit "unproven" badge (badge is UI, not D).
- **MMR diversity** (reusing the topic embeddings from §6): iteratively pick the candidate maximizing `λ·niche_score − (1−λ)·max cosine-similarity-to-already-picked` (default `λ = 0.7`). Select the top ~10 overall, targeting **4–5 proven + 2–3 unproven**; write `digest_rank` (1-based) on the selected clusters, `null` on the rest.

### 7.4 Explicitly NOT in D
The weekly **digest email** (§4.10) and **sealed `niche_predictions`** writes (§4.13) are deferred to the digest sub-phase — both are coupled to "digest send time," not to clustering. D stops at `digest_rank`.

## 8. Admin pages (new `/admin` route group)

Built with the Sub-phase B design system (`AppShell`, `PageHeader`, `src/components/ui/*`), dark-first, each page **leading with its one primary signal**. Admin routes follow the app's existing session gating (same as `/lab`).

### 8.1 `/admin/ingestion-health`
- Reads `ingestion_runs` (via existing `listRecentRunsByJob`, plus a `listLatestRunPerJob` helper to add to the repo).
- Layout leads with an **overall health banner** (all-green / N sources stale or failing). Below: one row per source/job — last-run time, status, a **success-rate sparkline** over recent runs, **color-coded freshness** (green/amber/red against each job's expected cadence), items ingested, quota units.
- **Manual-trigger button** per source → `POST /api/admin/trigger-ingestion` with `{ job }`. That route calls the **same adapter + `runWithIngestionLog`** the cron uses. This requires refactoring each existing cron route so its core run is an exported callable (e.g. `runShortsSearch` already is; ensure all six C jobs + the two new D jobs expose a `runX` the admin route can dispatch by name). No logic duplication.

### 8.2 `/admin/classification-review`
- Reads `classification_samples` (new repo). Leads with **per-`format_label` accuracy** (reviewed-correct / reviewed-total) as the primary signal.
- Below: a queue of unreviewed samples showing thumbnail, title, chosen labels, and the model's response; each gets a **correct / wrong / partial** verdict control that writes back (`reviewed`, `review_verdict`, `reviewed_by`, `reviewed_at`) via the samples repo. Optional collapse to show the full prompt.

## 9. New table, repos, and queries

### 9.1 Migration (additive) — `topic_embeddings`
```sql
create table if not exists public.topic_embeddings (
  topic_label text primary key,
  model       text not null,
  embedding   jsonb not null,            -- float[] as jsonb; no pgvector
  created_at  timestamptz not null default now()
);
```
Single additive table. **Prod apply (`jfmjppzjicvbpnlkmxbg`) is operator-gated** — surface "about to apply migration `topic_embeddings` to prod" and get in-chat sign-off before `apply_migration`, then regenerate `src/lib/supabase/types.ts`.

### 9.2 New repo — `src/lib/supabase/repositories/classification-samples.ts`
- `insertClassificationSample(supabase, params)`
- `listUnreviewedSamples(supabase, { limit })`
- `recordSampleVerdict(supabase, { id, verdict, reviewedBy })`
- `aggregateAccuracyByFormat(supabase)` → per-format reviewed-correct/total (can be a view-style aggregate query).

### 9.3 New repo — `src/lib/supabase/repositories/topic-embeddings.ts`
- `getEmbeddings(supabase, { labels, model })` → map of label → embedding for cache hits.
- `upsertEmbeddings(supabase, rows)` → batch insert misses.

### 9.4 Repo additions to existing files
- `shorts-observations.ts`: `listUnclassifiedObservations(supabase, { limit })`; `listClassifiedObservationsSince(supabase, { since, minConfidence })` (the clustering join).
- `ingestion-runs.ts`: `listLatestRunPerJob(supabase)` for the health banner.
- `niche-clusters.ts`: `insertNicheClusters` batch + a `replaceWeek(supabase, weekStart, rows)` so a re-run of a week is idempotent (delete-then-insert that week's rows in a transaction-like sequence).

## 10. Testing (Vitest)

Mirror the existing mock-the-gateway pattern (`vi.mock("ai")`, `vi.mock("@/lib/ai/gateway")`/`models`). Unit coverage:
- Transcript parser: timedtext payload → flattened text; missing-captions / malformed → `null` (no throw).
- Classifier orchestration: topic batch of 10 with a mocked `generateObject` (including a dropped-entry re-issue path); format pass concurrency cap; confidence = min of passes; 5% sampling is deterministic under a seeded RNG; `transcript_used` reflects client result.
- Derivations: format→`production_fit` map (all 18 labels); `discovery_state` heuristic (pre_public vs public from source mix); modal `audience_signal`.
- Scoring: each component's value and `null` path; **renormalization** math (e.g. with `proven_score` null, weights sum correctly); `explainability_top_signals` shape.
- Clustering math: cosine, the ≥0.85 merge into canonical, min-3 filter, MMR selection and the 4–5/2–3 band targets.
- Embedding cache: hit/miss path with a mocked `embedMany`.

Live gateway / live-DB tests stay **env-gated** and skip when `AI_GATEWAY_API_KEY` / DB env are blank — matching the C baseline (11 pre-existing env-gated failures, no new ones). `npx tsc --noEmit` clean, no `any`.

## 11. `vercel.ts`
Register the two new crons:
- `{ path: '/api/cron/classify-observations', schedule: '15 */6 * * *' }`
- `{ path: '/api/cron/cluster-niches', schedule: '0 23 * * 0' }`

## 12. File-layout summary

```
src/lib/clients/youtube-transcript.ts            # timedtext client (new)
src/lib/ai/models.ts                             # gateway model strings + getGatewayModel (new)
src/lib/classifier/                              # two-pass classifier lib (new)
src/lib/clustering/                              # join + fuzzy-merge + cluster (new)
src/lib/scoring/                                 # components + niche_score + two-band/MMR (new)
src/lib/scoring/weights.ts                       # tunable weights (new)
src/app/api/cron/classify-observations/route.ts  # cron (new)
src/app/api/cron/cluster-niches/route.ts         # cron (new)
src/app/api/admin/trigger-ingestion/route.ts     # manual trigger (new)
src/app/admin/ingestion-health/page.tsx          # admin page (new)
src/app/admin/classification-review/page.tsx     # admin page (new)
src/lib/supabase/repositories/classification-samples.ts   # repo (new)
src/lib/supabase/repositories/topic-embeddings.ts         # repo (new)
supabase/migrations/<ts>_topic_embeddings.sql    # additive table (new, prod-gated)
# edits: shorts-observations.ts, ingestion-runs.ts, niche-clusters.ts repos;
#        env.ts (AI_GATEWAY_API_KEY used); vercel.ts (2 crons);
#        existing cron routes export runX callables for the manual-trigger route.
```

## 13. Explicit non-goals for Sub-phase D
Digest email (§4.10); sealed `niche_predictions` (§4.13); comment-text ingestion / `comment_depth_score` formula; niche-finder **user** UI surfaces (§4.9); `/admin/prompt-versions`, `/admin/scoring-analysis`, `/admin/costs`, `/admin/health`; TikTok real ingest; migrating A–C LLM call sites to the gateway; pgvector.

## 14. Verification & done-criteria for D
- `npx tsc --noEmit` clean, no `any`; `npm test` green except the known pre-existing env-gated suite.
- `topic_embeddings` migrated to prod (after sign-off); `types.ts` regenerated.
- Classifier cron, given seeded `shorts_observations`, writes `shorts_classifications` + ~5% `classification_samples`, with transcripts attempted and gracefully skipped on failure.
- Clustering cron produces `niche_clusters` with `production_fit`, `discovery_state`, scores, and `digest_rank` on the top ~10 across both bands.
- Both admin pages render against the design system and read/write real tables; manual-trigger fires a real ingestion run and logs an `ingestion_runs` row.
- Live smoke remains operator-gated on real secrets (`AI_GATEWAY_API_KEY`, `YOUTUBE_API_KEY`), like C.
